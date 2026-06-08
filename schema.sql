-- ============================================================
-- SCHEMA COMPLETO - Casa de Cambio
-- Ejecutar en el SQL Editor de Supabase (nuevo proyecto)
-- ============================================================

-- ── 1. TABLA: profiles ───────────────────────────────────────────
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null unique,
  nombre             text not null,
  rol                text not null check (rol in ('superusuario', 'operador', 'cliente')),
  activo             boolean not null default true,
  cuenta_cte         text,
  telefono           text,
  notas              text,
  debe_cambiar_clave boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Usuarios ven su propio perfil"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Superusuarios ven todos los perfiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

create policy "Superusuarios editan perfiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

create policy "Usuarios actualizan su propio perfil"
  on public.profiles for update
  using (auth.uid() = id);

-- Trigger para updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_profiles_updated
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Trigger: crear perfil automáticamente al registrar usuario en auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'rol', 'cliente')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 2. TABLA: cuentas_corrientes ─────────────────────────────────
create table if not exists public.cuentas_corrientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cuentas_corrientes enable row level security;

create policy "Autenticados ven cuentas activas"
  on public.cuentas_corrientes for select
  to authenticated
  using (activo = true);

create policy "Superusuarios gestionan cuentas"
  on public.cuentas_corrientes for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );


-- ── 3. TABLA: tipos_operacion ────────────────────────────────────
create table if not exists public.tipos_operacion (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  descripcion text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.tipos_operacion enable row level security;

create policy "Autenticados ven tipos activos"
  on public.tipos_operacion for select
  to authenticated
  using (activo = true);

create policy "Superusuarios gestionan tipos"
  on public.tipos_operacion for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

-- Tipos de operación iniciales (ajustar según necesidad)
insert into public.tipos_operacion (codigo, descripcion) values
  ('COMPRA',  'Compra de divisa'),
  ('VENTA',   'Venta de divisa'),
  ('INGRESO', 'Ingreso de fondos'),
  ('EGRESO',  'Egreso de fondos')
on conflict (codigo) do nothing;


-- ── 4. TABLA: diario ─────────────────────────────────────────────
create table if not exists public.diario (
  id                uuid primary key default gen_random_uuid(),
  fecha             date not null,
  tipo              text not null,
  cuenta_cte        text not null,
  operacion         text not null,
  concepto          text,
  evento            text,
  detalle           text,
  recibo            text,
  moneda            text not null default 'ARS',
  monto             numeric(18,2) not null default 0,
  cc_pesos          numeric(18,2),
  cc_dolares        numeric(18,2),
  cc_euros          numeric(18,2),
  cc_reales         numeric(18,2),
  anulado           boolean not null default false,
  anulado_por       text,
  anulado_at        timestamptz,
  motivo_anulacion  text,
  notas             text,
  creado_por        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_diario_fecha      on public.diario(fecha);
create index if not exists idx_diario_cuenta_cte on public.diario(cuenta_cte);
create index if not exists idx_diario_tipo       on public.diario(tipo);

alter table public.diario enable row level security;

create policy "Clientes ven sus propios movimientos"
  on public.diario for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.rol = 'cliente'
        and p.cuenta_cte = diario.cuenta_cte
    )
  );

create policy "Operadores y superusuarios ven todo"
  on public.diario for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );

create policy "Operadores y superusuarios insertan"
  on public.diario for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );

create policy "Superusuarios actualizan"
  on public.diario for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

create trigger on_diario_updated
  before update on public.diario
  for each row execute procedure public.handle_updated_at();


-- ── 5. VISTA: saldos_cuenta_corriente ────────────────────────────
create or replace view public.saldos_cuenta_corriente as
select
  cuenta_cte,
  sum(cc_pesos)    as saldo_pesos,
  sum(cc_dolares)  as saldo_dolares,
  sum(cc_euros)    as saldo_euros,
  sum(cc_reales)   as saldo_reales,
  max(fecha)       as ultimo_movimiento
from public.diario
where anulado = false and tipo = 'CTA CTE'
group by cuenta_cte;


-- ── 6. FUNCIONES RPC ─────────────────────────────────────────────

-- Obtener el rol del usuario actual
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select rol from public.profiles where id = auth.uid();
$$;

-- Obtener la cuenta corriente del usuario actual
create or replace function public.get_my_cuenta_cte()
returns text language sql security definer stable as $$
  select cuenta_cte from public.profiles where id = auth.uid();
$$;

-- Marcar que el usuario ya cambió su clave
create or replace function public.marcar_clave_cambiada(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles
  set debe_cambiar_clave = false, updated_at = now()
  where id = p_user_id;
end;
$$;

-- Crear usuario administrado (superusuario invita a un cliente/operador)
create or replace function public.crear_usuario_admin(
  p_email      text,
  p_password   text,
  p_nombre     text,
  p_rol        text,
  p_cuenta_cte text default null
)
returns uuid language plpgsql security definer as $$
declare
  v_user_id uuid;
begin
  -- Solo superusuarios pueden llamar esta función
  if (select rol from public.profiles where id = auth.uid()) != 'superusuario' then
    raise exception 'Sin permisos';
  end if;

  -- Crear usuario en auth.users
  v_user_id := (
    select id from auth.users where email = p_email
  );

  if v_user_id is null then
    insert into auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at,
      aud, role
    ) values (
      gen_random_uuid(),
      p_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      jsonb_build_object('nombre', p_nombre, 'rol', p_rol),
      now(), now(),
      'authenticated', 'authenticated'
    )
    returning id into v_user_id;
  end if;

  -- Actualizar o crear el perfil
  insert into public.profiles (id, email, nombre, rol, cuenta_cte, debe_cambiar_clave)
  values (v_user_id, p_email, p_nombre, p_rol, p_cuenta_cte, true)
  on conflict (id) do update set
    nombre             = excluded.nombre,
    rol                = excluded.rol,
    cuenta_cte         = excluded.cuenta_cte,
    debe_cambiar_clave = true,
    activo             = true,
    updated_at         = now();

  return v_user_id;
end;
$$;

-- Cambiar contraseña de un usuario (por superusuario)
create or replace function public.admin_cambiar_clave(
  p_user_id uuid,
  p_nueva_clave text
)
returns void language plpgsql security definer as $$
begin
  if (select rol from public.profiles where id = auth.uid()) != 'superusuario' then
    raise exception 'Sin permisos';
  end if;

  update auth.users
  set encrypted_password = crypt(p_nueva_clave, gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;

  update public.profiles
  set debe_cambiar_clave = true, updated_at = now()
  where id = p_user_id;
end;
$$;


-- ── 7. SUPERUSUARIO INICIAL ──────────────────────────────────────
-- IMPORTANTE: Reemplazá el email y contraseña antes de ejecutar
-- Después de ejecutar esto, iniciá sesión con estas credenciales

-- Opción A: Crear desde el Dashboard de Supabase
--   Authentication > Users > Add user
--   Email: tu@email.com | Password: TuClave123!

-- Opción B: Ejecutar este bloque (reemplazá los valores)
/*
do $$
declare v_id uuid;
begin
  insert into auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at, aud, role
  ) values (
    gen_random_uuid(),
    'REEMPLAZAR@EMAIL.COM',
    crypt('REEMPLAZAR_CLAVE', gen_salt('bf')),
    now(), '{}', now(), now(), 'authenticated', 'authenticated'
  ) returning id into v_id;

  update public.profiles set rol = 'superusuario', debe_cambiar_clave = false
  where id = v_id;
end $$;
*/
