-- ============================================================================
-- BOOTSTRAP — base completa desde cero
--
-- GENERADO por scripts/generar-bootstrap.mts el 2026-10-15. NO EDITAR A MANO:
-- el próximo que corra el generador pisa los cambios. Para modificarlo, tocá la
-- migración correspondiente y volvé a generar.
--
-- CÓMO SE USA: pegar entero en el SQL Editor de un proyecto Supabase NUEVO.
-- Es idempotente (todo va con `if not exists` / `create or replace`), así que
-- se puede correr dos veces sin romper nada.
--
-- Contiene 22 archivos. Quedan afuera 4:
--   · 2026-07-06_ve_ganancias.sql
--     SUPERADA por 2026-08-11_roles.sql, que elimina `ve_ganancias` y la reemplaza por el rol. Esa migración se protege con un `if exists` sobre la columna, así que funciona sin esta.
--   · 2026-08-13_rollback_roles.sql
--     ROLLBACK: deshace el modelo de roles. Incluirla dejaría la base en el modelo viejo.
--   · 2026-09-01_corregir_signo_cta_cte.sql
--     Corrige el signo de filas YA CARGADAS. En una base vacía no hay nada que corregir.
--   · 2026-09-01_detectar_huerfanas_diario.sql
--     Diagnóstico: solo consulta, no modifica nada. Es una herramienta, no un paso de instalación.
-- ============================================================================


-- ══════════════════════════════════════════════════════════════════════════
-- schema.sql
-- ══════════════════════════════════════════════════════════════════════════

-- ============================================================
-- SCHEMA COMPLETO - Casa de Cambio
-- Ejecutar en el SQL Editor de Supabase (nuevo proyecto)
-- ============================================================

-- ── 0. MODELO DE ROLES ───────────────────────────────────────────
--   cliente        solo su cuenta corriente y su contraseña
--   operador       cuentas corrientes y transacciones; carga, pero NO edita ni borra
--   administrador  acceso total SIN Ganancias
--   superadmin     acceso total CON Ganancias
--
-- El rol es la ÚNICA fuente de verdad de permisos. Las policies no comparan strings:
-- llaman a los predicados de más abajo, que son el espejo de src/lib/roles.ts.


-- ── 1. TABLA: profiles ───────────────────────────────────────────
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null unique,
  nombre             text not null,
  rol                text not null check (rol in ('superadmin', 'administrador', 'operador', 'cliente')),
  activo             boolean not null default true,
  cuenta_cte         text,
  telefono           text,
  notas              text,
  debe_cambiar_clave boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Predicados de permiso — el único lugar donde vive la jerarquía.
-- `security definer` para que puedan consultar `profiles` sin quedar atrapados en la
-- RLS de la propia tabla.
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid()
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() in ('superadmin', 'administrador'), false)
$$;

create or replace function public.es_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() in ('superadmin', 'administrador', 'operador'), false)
$$;

create or replace function public.ve_ganancias()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = 'superadmin', false)
$$;

drop policy if exists "Usuarios ven su propio perfil" on public.profiles;
create policy "Usuarios ven su propio perfil"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Administradores ven todos los perfiles" on public.profiles;
create policy "Administradores ven todos los perfiles"
  on public.profiles for select
  using (public.es_admin());

drop policy if exists "Administradores editan perfiles" on public.profiles;
create policy "Administradores editan perfiles"
  on public.profiles for update
  using (public.es_admin());

drop policy if exists "Usuarios actualizan su propio perfil" on public.profiles;
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

drop trigger if exists on_profiles_updated on public.profiles;
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

drop trigger if exists on_auth_user_created on auth.users;
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

drop policy if exists "Autenticados ven cuentas activas" on public.cuentas_corrientes;
create policy "Autenticados ven cuentas activas"
  on public.cuentas_corrientes for select
  to authenticated
  using (activo = true);

drop policy if exists "Administradores gestionan cuentas" on public.cuentas_corrientes;
create policy "Administradores gestionan cuentas"
  on public.cuentas_corrientes for all
  using (public.es_admin());


-- ── 3. TABLA: tipos_operacion ────────────────────────────────────
create table if not exists public.tipos_operacion (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null unique,
  descripcion text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.tipos_operacion enable row level security;

drop policy if exists "Autenticados ven tipos activos" on public.tipos_operacion;
create policy "Autenticados ven tipos activos"
  on public.tipos_operacion for select
  to authenticated
  using (activo = true);

drop policy if exists "Administradores gestionan tipos" on public.tipos_operacion;
create policy "Administradores gestionan tipos"
  on public.tipos_operacion for all
  using (public.es_admin());

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

drop policy if exists "Clientes ven sus propios movimientos" on public.diario;
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

drop policy if exists "Staff ve el diario" on public.diario;
create policy "Staff ve el diario"
  on public.diario for select
  using (public.es_staff());

drop policy if exists "Staff inserta en el diario" on public.diario;
create policy "Staff inserta en el diario"
  on public.diario for insert
  with check (public.es_staff());

drop policy if exists "Administradores actualizan el diario" on public.diario;
create policy "Administradores actualizan el diario"
  on public.diario for update
  using (public.es_admin());

drop trigger if exists on_diario_updated on public.diario;
create trigger on_diario_updated
  before update on public.diario
  for each row execute procedure public.handle_updated_at();


-- ── 5. VISTA: saldos_cuenta_corriente ────────────────────────────
drop view if exists public.saldos_cuenta_corriente cascade;
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

-- Crear usuario administrado (un administrador invita a un cliente/operador).
-- HEREDADA: la app no la usa (el alta va por /api/admin/usuarios). Queda por
-- compatibilidad; la comprobación de permiso usa el predicado nuevo.
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
  -- Solo administradores pueden llamar esta función
  if not public.es_admin() then
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

-- Cambiar contraseña de un usuario (por un administrador).
-- HEREDADA: la app no la usa (el reseteo va por /api/admin/usuarios).
create or replace function public.admin_cambiar_clave(
  p_user_id uuid,
  p_nueva_clave text
)
returns void language plpgsql security definer as $$
begin
  if not public.es_admin() then
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


-- ── 7. SUPERADMIN INICIAL ────────────────────────────────────────
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

  update public.profiles set rol = 'superadmin', debe_cambiar_clave = false
  where id = v_id;
end $$;
*/


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/add_cotizacion.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Agrega columna cotizacion a la tabla diario
ALTER TABLE public.diario ADD COLUMN IF NOT EXISTS cotizacion numeric(18,4);


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-06-15_diario_delete_policy.sql
-- ══════════════════════════════════════════════════════════════════════════

-- ============================================================
-- FIX: Falta policy de DELETE en la tabla diario
-- ============================================================
-- Problema: con RLS activado, si no existe una policy FOR DELETE,
-- todos los DELETE afectan 0 filas SIN dar error. Por eso el sync
-- nunca borraba los datos viejos y se acumulaban duplicados
-- (ej: el registro 9,27 generado por una version vieja del parser).
--
-- Ejecutar este bloque en el SQL Editor de Supabase UNA sola vez.
-- ============================================================

drop policy if exists "Superusuarios borran" on public.diario;
create policy "Superusuarios borran"
  on public.diario for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

-- Despues de ejecutar esto, entra a la app y sincroniza una vez.
-- El sync ahora SI borra los datos viejos antes de reinsertar,
-- eliminando los duplicados.


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-06-24_sync_state.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Estado del proceso de sincronización.
-- Guarda, entre otras cosas, el modifiedTime del archivo CAJA en Drive para que el
-- cron incremental pueda saltar trabajo cuando la planilla no cambió desde la última corrida.
create table if not exists public.sync_state (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- Solo el backend (service role) la lee/escribe; no se expone a clientes.
alter table public.sync_state enable row level security;


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-06-30_clientes.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Lista de clientes para el selector de "Nueva Transacción".
--
-- Distinto de `cuentas_corrientes`: esa tabla solo guarda clientes con movimientos de
-- tipo CTA CTE (la usa también la pantalla de Cuenta Corriente para filtrar extractos).
-- `clientes` es la unión de TODOS los nombres que aparecen en las columnas CLIENTE y CAJA
-- de la planilla (sea cual sea el tipo de operación), calculada por el sync.
create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.clientes enable row level security;

drop policy if exists "Autenticados ven clientes activos" on public.clientes;
create policy "Autenticados ven clientes activos"
  on public.clientes for select
  to authenticated
  using (activo = true);

drop policy if exists "Superusuarios gestionan clientes" on public.clientes;
create policy "Superusuarios gestionan clientes"
  on public.clientes for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-05_movimientos_caja.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Tabla `movimientos_caja`: TODAS las filas de la solapa CAJA de la planilla (compras,
-- ventas, gastos, ingresos/egresos, saldos iniciales, cta cte, etc.), cargadas por el
-- sync nocturno. Es la base de datos sobre la que se construyen los reportes de la app
-- (situación de caja, clientes, histórico, ganancias) para poder prescindir del Sheet.
--
-- Distinto de `diario`: esa tabla solo tiene los movimientos de CTA CTE con el esquema
-- que necesita la pantalla de extractos. Esta tabla es el espejo completo de CAJA.

create table if not exists public.movimientos_caja (
  id          uuid primary key default gen_random_uuid(),
  fila_sheet  integer,            -- nro de fila en la planilla (trazabilidad del sync)
  fecha       date not null,
  tipo        text not null,      -- 'CAJA' | 'CTA CTE'
  cliente     text,               -- ver comment de la columna
  operacion   text not null,      -- COMPRA / VENTA / INGRESAN / EGRESAN / GASTOS / ...
  propio      text,               -- moneda propia
  externo     text,               -- moneda externa ('' si no aplica)
  monto       numeric(18,2) not null default 0,
  cot         numeric(18,6),
  costo_pct   numeric(9,6),
  debe        text,               -- repartidor: si está cargado, el dinero está "en la calle"
  notas       text,
  cuenta      text,               -- agrupación de reportes de la planilla (CAJA/CAMBIO DIVISAS/...)

  -- Columnas calculadas POR LA PLANILLA. Durante la convivencia son la fuente de verdad;
  -- el motor de cálculo de la app (src/lib/motor-calculo) las recalcula en paralelo para
  -- validar antes de reemplazarlas.
  pesos       numeric(18,2) not null default 0,
  cheques     numeric(18,2) not null default 0,
  dolares     numeric(18,2) not null default 0,
  euros       numeric(18,2) not null default 0,
  reales      numeric(18,2) not null default 0,
  banco       numeric(18,2) not null default 0,
  cc_pesos    numeric(18,2) not null default 0,
  cc_dolares  numeric(18,2) not null default 0,
  cc_euros    numeric(18,2) not null default 0,
  cc_reales   numeric(18,2) not null default 0,

  synced_at   timestamptz not null default now()
);

comment on column public.movimientos_caja.cliente is
  'Texto libre, NO normalizado: en las filas de tipo CAJA son clientes eventuales tal '
  'como se tipearon en la planilla (decisión de negocio 5/7/2026 — normalizar dependerá '
  'del uso futuro de la app). En filas CTA CTE es el nombre de la cuenta corriente.';

create index if not exists idx_mcaja_fecha     on public.movimientos_caja(fecha);
create index if not exists idx_mcaja_cliente   on public.movimientos_caja(cliente);
create index if not exists idx_mcaja_operacion on public.movimientos_caja(operacion);
create index if not exists idx_mcaja_tipo      on public.movimientos_caja(tipo);
-- Parcial: la vista de "dinero en la calle" solo mira filas con repartidor cargado.
create index if not exists idx_mcaja_debe      on public.movimientos_caja(debe) where debe is not null;

alter table public.movimientos_caja enable row level security;

-- Solo el personal ve la caja completa (los clientes ya tienen su vista en `diario`).
drop policy if exists "Operadores y superusuarios ven movimientos de caja" on public.movimientos_caja;
create policy "Operadores y superusuarios ven movimientos de caja"
  on public.movimientos_caja for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );
-- Sin policies de escritura: solo escribe el sync (service role, que saltea RLS).

-- Totales de control para validar cada corrida del sync (conteo + suma por columna).
-- La usa el sync tras insertar, y sirve también para chequeos manuales.
drop function if exists public.caja_totales(date, date);
create or replace function public.caja_totales(p_desde date default null, p_hasta date default null)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'filas',      count(*),
    'pesos',      coalesce(sum(pesos), 0),
    'cheques',    coalesce(sum(cheques), 0),
    'dolares',    coalesce(sum(dolares), 0),
    'euros',      coalesce(sum(euros), 0),
    'reales',     coalesce(sum(reales), 0),
    'banco',      coalesce(sum(banco), 0),
    'cc_pesos',   coalesce(sum(cc_pesos), 0),
    'cc_dolares', coalesce(sum(cc_dolares), 0),
    'cc_euros',   coalesce(sum(cc_euros), 0),
    'cc_reales',  coalesce(sum(cc_reales), 0)
  )
  from public.movimientos_caja
  where (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta);
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-06_cot_efectiva.sql
-- ══════════════════════════════════════════════════════════════════════════

-- La planilla calcula las columnas de moneda con COTEXT (=IF(COT=0;1;COT)), pero en
-- ~490 filas históricas el operador pisó esa fórmula a mano con la cotización efectiva
-- (con decimales) mientras en COT quedó un valor redondeado. Para que el motor de
-- cálculo reproduzca EXACTO a la planilla hay que conservar ambas: `cot` (lo que cargó
-- el operador) y `cot_efectiva` (COTEXT, la que usa el cálculo).
alter table public.movimientos_caja
  add column if not exists cot_efectiva numeric(18,6);

comment on column public.movimientos_caja.cot_efectiva is
  'Columna COTEXT de la planilla: la cotización que realmente usa el cálculo. '
  'Normalmente igual a cot (o 1 si cot está vacía), salvo en filas donde el operador '
  'la pisó a mano con la tasa efectiva con decimales.';


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-06_editar_movimientos.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Edición de movimientos desde la app (pantalla Transacciones → Editar).
-- SOLO superusuario puede editar (el operador ve la pantalla pero no la acción).
--
-- IMPORTANTE (decisión de negocio 5/7/2026): mientras la planilla siga siendo la fuente
-- de verdad, la edición NO se escribe en el Google Sheet, y el próximo sync (que borra y
-- reinserta) PISA los cambios hechos desde la app. La funcionalidad queda construida
-- para el momento en que la app pase a ser la única fuente de verdad.

alter table public.movimientos_caja
  add column if not exists editado_por text,
  add column if not exists editado_at  timestamptz;

comment on column public.movimientos_caja.editado_por is
  'Nombre del usuario de la app que editó la fila por última vez. Se pierde con el '
  'próximo sync mientras dure la convivencia con la planilla (comportamiento asumido).';

-- Se elimina la versión anterior de la policy si existiera (permitía también operador).
drop policy if exists "Operadores y superusuarios editan movimientos de caja"
  on public.movimientos_caja;
drop policy if exists "Superusuarios editan movimientos de caja"
  on public.movimientos_caja;

drop policy if exists "Superusuarios editan movimientos de caja" on public.movimientos_caja;
create policy "Superusuarios editan movimientos de caja"
  on public.movimientos_caja for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-09_tablero_inicio.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Objetos de datos para el tablero de Inicio (situación de caja + histórico), todos
-- derivados EXACTAMENTE de movimientos_caja (misma fuente validada contra la planilla:
-- la suma de cada columna de moneda = saldo en caja de esa moneda).
--
-- Seguro correrla más de una vez (create or replace / drop if exists).

-- ── Vista: totales de CAJA por cliente (para la pestaña "Caja" de la tabla de clientes) ──
-- security_invoker: respeta la RLS de movimientos_caja (solo staff la consulta).
drop view if exists public.caja_clientes;
create view public.caja_clientes
with (security_invoker = true) as
select
  cliente,
  sum(pesos)   as pesos,
  sum(dolares) as dolares,
  sum(euros)   as euros,
  sum(reales)  as reales,
  count(*)     as movimientos
from public.movimientos_caja
where operacion <> 'OPERACION?'
  and cliente is not null
  and btrim(cliente) <> ''
group by cliente;

-- ── RPC: saldo diario acumulado por moneda (para el gráfico de línea del tablero) ──
-- Devuelve, por cada fecha con movimientos, el saldo acumulado (running sum) de la
-- columna de la moneda pedida. La app toma la ventana que necesite (p. ej. últimos 90
-- días) y deriva de ahí los deltas mensuales. security invoker por defecto → respeta RLS.
create or replace function public.caja_saldo_diario(p_moneda text default 'dolares')
returns table(fecha date, saldo numeric)
language sql
stable
as $$
  select fecha,
    sum(sum(
      case lower(p_moneda)
        when 'pesos'   then pesos
        when 'dolares' then dolares
        when 'euros'   then euros
        when 'reales'  then reales
        else dolares
      end
    )) over (order by fecha) as saldo
  from public.movimientos_caja
  where operacion <> 'OPERACION?'
  group by fecha
  order by fecha;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-10_caja_clientes_periodo.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Totales de CAJA por cliente FILTRABLES POR PERÍODO, para que los filtros del tablero
-- de Inicio (Día/Semana/Mes/Año/Rango) afecten también a la tabla de clientes.
-- Misma lógica que la vista caja_clientes, con rango opcional de fechas.
-- SECURITY INVOKER (default de las funciones): respeta la RLS de movimientos_caja.
-- Segura de correr más de una vez (create or replace).
drop function if exists public.caja_clientes_periodo(date, date);
create or replace function public.caja_clientes_periodo(p_desde date default null, p_hasta date default null)
returns table(cliente text, pesos numeric, dolares numeric, euros numeric, reales numeric, movimientos bigint)
language sql
stable
as $$
  select
    cliente,
    sum(pesos)   as pesos,
    sum(dolares) as dolares,
    sum(euros)   as euros,
    sum(reales)  as reales,
    count(*)     as movimientos
  from public.movimientos_caja
  where operacion <> 'OPERACION?'
    and cliente is not null
    and btrim(cliente) <> ''
    and (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta)
  group by cliente;
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-11_app_config.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Configuración de la app editable sin deploy (clave/valor JSON).
-- Primer uso: umbral de alerta de Nueva transacción, expresado en DÓLARES
-- (decisión 11/7/2026: la alerta evalúa el valor en USD de la operación).
-- Segura de correr más de una vez.
create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "Staff lee configuración" on public.app_config;
drop policy if exists "Staff lee configuración" on public.app_config;
create policy "Staff lee configuración"
  on public.app_config for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );

drop policy if exists "Superusuarios escriben configuración" on public.app_config;
drop policy if exists "Superusuarios escriben configuración" on public.app_config;
create policy "Superusuarios escriben configuración"
  on public.app_config for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

-- Valor inicial: US$ 1.000 (ajustable desde la app).
insert into public.app_config (key, value)
  values ('umbral_alerta_usd', '{"usd": 1000}'::jsonb)
  on conflict (key) do nothing;


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-11_delete_movimientos_caja.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Borrado de movimientos desde la app (pantalla Transacciones → 🗑️).
-- SOLO superusuario (mismo criterio que editar). Igual que la edición, NO toca el
-- Google Sheet: si la fila también existe en la planilla, el próximo sync la vuelve
-- a traer (comportamiento asumido durante la convivencia).
-- Segura de correr más de una vez (drop if exists + create).
drop policy if exists "Superusuarios eliminan movimientos de caja"
  on public.movimientos_caja;
drop policy if exists "Superusuarios eliminan movimientos de caja" on public.movimientos_caja;
create policy "Superusuarios eliminan movimientos de caja"
  on public.movimientos_caja for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-11_insert_movimientos_caja.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Escritura directa de movimientos desde la app (Nueva transacción → movimientos_caja).
-- Hasta ahora solo escribía el sync (service role); para que el movimiento se vea al
-- instante en Transacciones/Inicio/Ganancias, el staff necesita policy de INSERT.
-- Segura de correr más de una vez (drop if exists + create).
drop policy if exists "Operadores y superusuarios insertan movimientos de caja"
  on public.movimientos_caja;
drop policy if exists "Operadores y superusuarios insertan movimientos de caja" on public.movimientos_caja;
create policy "Operadores y superusuarios insertan movimientos de caja"
  on public.movimientos_caja for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('operador', 'superusuario')
    )
  );


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-20_usdt.sql
-- ══════════════════════════════════════════════════════════════════════════

-- USDT (20/7/2026): nueva moneda que NO existe en la planilla; se opera únicamente desde
-- la app y solo en CAJA (compra/venta contra pesos y dólares, ingresos/egresos). Como el
-- sync borra y reinserta movimientos_caja desde el Sheet, se agrega la columna `origen`
-- para que el sync SOLO toque las filas provenientes de la planilla ('sheet') y respete
-- las cargadas en la app ('app'), donde vive USDT.
--
-- Es seguro correrla más de una vez (usa IF NOT EXISTS y CREATE OR REPLACE).

-- Columna de saldo USDT (solo caja, sin contrapartida de cuenta corriente).
alter table public.movimientos_caja
  add column if not exists usdt numeric(18,2) not null default 0;

-- Procedencia de la fila. Las existentes quedan como 'sheet' (las maneja el sync).
alter table public.movimientos_caja
  add column if not exists origen text not null default 'sheet';

comment on column public.movimientos_caja.usdt is
  'USDT (Tether). Moneda SOLO-app: no existe en la planilla. Solo movimientos de CAJA '
  '(sin cuenta corriente). Cargada desde la app, el sync no la escribe.';
comment on column public.movimientos_caja.origen is
  'Procedencia de la fila: ''sheet'' = la escribe y borra el sync desde la planilla; '
  '''app'' = alta hecha en la app (ej. USDT) — el sync NO la toca.';

-- El sync borra por origen; un índice ayuda a esa operación masiva.
create index if not exists idx_mcaja_origen on public.movimientos_caja(origen);

-- caja_totales: sumar también la columna USDT (el resto queda igual).
drop function if exists public.caja_totales(date, date);
create or replace function public.caja_totales(p_desde date default null, p_hasta date default null)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'filas',      count(*),
    'pesos',      coalesce(sum(pesos), 0),
    'cheques',    coalesce(sum(cheques), 0),
    'dolares',    coalesce(sum(dolares), 0),
    'euros',      coalesce(sum(euros), 0),
    'reales',     coalesce(sum(reales), 0),
    'usdt',       coalesce(sum(usdt), 0),
    'banco',      coalesce(sum(banco), 0),
    'cc_pesos',   coalesce(sum(cc_pesos), 0),
    'cc_dolares', coalesce(sum(cc_dolares), 0),
    'cc_euros',   coalesce(sum(cc_euros), 0),
    'cc_reales',  coalesce(sum(cc_reales), 0)
  )
  from public.movimientos_caja
  where (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta);
$$;


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-07-29_auditoria.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Auditoría: quién hizo qué y cuándo.
--
-- POR QUÉ UNA TABLA APARTE Y NO COLUMNAS EN movimientos_caja:
-- el sync full (diario) hace `delete().neq('origen','app')` + reinsert, con lo cual
--   (a) borra cualquier dato de auditoría guardado en la fila, y
--   (b) REGENERA los uuid.
-- Por eso el log vive en su propia tabla, que el sync no toca, cada evento es
-- autocontenido (guarda su propia foto de los datos) y la referencia a la fila es
-- BLANDA (sin foreign key), apoyada además en una `huella` de contenido que sí es
-- estable entre corridas del sync.
--
-- Es SEGURO correr esta migración dos veces (todo es if not exists / drop-create).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabla de auditoría (append-only)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.auditoria (
  id             bigint generated always as identity primary key,
  ts             timestamptz not null default now(),

  -- El usuario se guarda COPIADO, no por join: si mañana se borra o se renombra el
  -- perfil, el log tiene que seguir siendo legible tal como se registró.
  usuario_id     uuid,
  usuario_nombre text not null,
  usuario_rol    text,
  -- 'usuario' = lo hizo una persona en la app. 'sistema' = lo generó el sync o un
  -- proceso automático (ej. la carga inicial desde la planilla). Nunca se le atribuye
  -- a una persona algo que no hizo.
  actor          text not null default 'usuario'
                 check (actor in ('usuario', 'sistema')),

  accion         text not null
                 check (accion in ('alta', 'edicion', 'borrado', 'ingreso_calle',
                                   'login', 'login_fallido', 'usuario', 'config')),
  entidad        text not null default 'movimientos_caja',

  -- Referencia BLANDA a la fila: sirve mientras el uuid viva, pero el sync full lo
  -- regenera. La identificación duradera es `huella`.
  movimiento_id  uuid,
  -- Identificación por CONTENIDO (fecha|cliente|operación|monedas|monto|cot), el mismo
  -- criterio que ya usa el borrado espejado. Estable entre corridas del sync.
  huella         text,

  resumen        text,      -- descripción legible, para listar sin parsear los jsonb
  campos         text[],    -- nombres de los campos que cambiaron (solo en 'edicion')
  datos_antes    jsonb,     -- foto previa (en 'borrado' es la fila completa: permite deshacer)
  datos_despues  jsonb
);

comment on table public.auditoria is
  'Registro inmutable de acciones. Append-only: un trigger bloquea UPDATE y DELETE '
  'incluso para el service_role, para que el log no se pueda alterar desde la app.';
comment on column public.auditoria.huella is
  'Identificación por contenido del movimiento. Necesaria porque el sync full regenera '
  'los uuid de movimientos_caja en cada corrida.';
comment on column public.auditoria.actor is
  'usuario = acción de una persona en la app; sistema = sync / carga inicial. Evita '
  'atribuirle a una persona filas que en realidad vinieron de la planilla.';

create index if not exists auditoria_ts_idx            on public.auditoria (ts desc);
create index if not exists auditoria_movimiento_id_idx on public.auditoria (movimiento_id);
create index if not exists auditoria_huella_idx        on public.auditoria (huella);
create index if not exists auditoria_usuario_idx       on public.auditoria (usuario_id);
create index if not exists auditoria_accion_idx        on public.auditoria (accion);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Inmutabilidad real
-- ─────────────────────────────────────────────────────────────────────────
-- Las policies de RLS no alcanzan: el backend usa el service_role, que las saltea.
-- Un trigger sí frena a todos. Un log que el propio auditado puede editar no sirve
-- como auditoría.
create or replace function public.auditoria_solo_lectura()
returns trigger
language plpgsql
as $$
begin
  raise exception 'La auditoría es inmutable: no se puede % un registro existente.',
    lower(tg_op);
end;
$$;

drop trigger if exists auditoria_no_modificar on public.auditoria;
drop trigger if exists auditoria_no_modificar on public.auditoria;
create trigger auditoria_no_modificar
  before update or delete on public.auditoria
  for each row execute function public.auditoria_solo_lectura();

-- (Si alguna vez hiciera falta una corrección excepcional, se desactiva a mano con
--  `alter table public.auditoria disable trigger auditoria_no_modificar;` y se vuelve
--  a activar. Que requiera ese paso explícito es justamente el punto.)

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS: se puede insertar y leer; nunca modificar
-- ─────────────────────────────────────────────────────────────────────────
alter table public.auditoria enable row level security;

drop policy if exists "Staff registra auditoría" on public.auditoria;
drop policy if exists "Staff registra auditoría" on public.auditoria;
create policy "Staff registra auditoría"
  on public.auditoria for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('superusuario', 'operador')
    )
  );

drop policy if exists "Superusuarios leen auditoría" on public.auditoria;
drop policy if exists "Superusuarios leen auditoría" on public.auditoria;
create policy "Superusuarios leen auditoría"
  on public.auditoria for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol = 'superusuario'
    )
  );

-- No se crean policies de UPDATE ni DELETE: sin policy, RLS las niega. El trigger de
-- arriba cubre además al service_role.

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Autor visible en la fila (denormalizado, para mostrar en Transacciones)
-- ─────────────────────────────────────────────────────────────────────────
-- Duplica lo que ya está en la auditoría, pero evita un join por fila en el listado.
-- El sync lo repuebla en cada corrida (ver sync-background.mts), así que se
-- autocorrige y no queda desactualizado.
alter table public.movimientos_caja
  add column if not exists creado_por text,
  add column if not exists creado_at  timestamptz;

comment on column public.movimientos_caja.creado_por is
  'Quién cargó la fila. Las filas que vienen de la planilla llevan la leyenda de carga '
  'inicial, NO el nombre de una persona: nadie de la app las cargó realmente.';

create index if not exists movimientos_caja_creado_por_idx
  on public.movimientos_caja (creado_por);


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-08-11_roles.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Modelo de roles de cuatro niveles (definido 11/8/2026).
--
-- POR QUÉ
-- Hasta ahora el permiso de Ganancias era una columna booleana aparte (`ve_ganancias`)
-- y el rol administrativo era uno solo (`superusuario`). Dos fuentes de verdad para una
-- misma pregunta —"¿qué puede hacer este usuario?"— repartidas además en ~20 policies y
-- ~25 archivos de código con comparaciones literales de string. Fue exactamente por ahí
-- que se coló el agujero: alcanzaba con que UN camino se olvidara de mirar la columna.
--
-- EL MODELO NUEVO
--   cliente        solo su cuenta corriente y su contraseña
--   operador       cuentas corrientes y transacciones; carga, pero NO edita ni borra
--   administrador  acceso total SIN Ganancias
--   superadmin     acceso total CON Ganancias
--
-- El rol pasa a ser la ÚNICA fuente de verdad: `ve_ganancias` se elimina. Y las policies
-- dejan de comparar strings: pasan a llamar a `es_admin()` / `es_staff()` / `ve_ganancias()`.
-- Agregar o mover un permiso vuelve a ser un solo lugar, no veinte.
--
-- Es SEGURO correr esta migración dos veces: la conversión de datos está guardada por la
-- existencia de la columna vieja, y todo lo demás es create-or-replace / drop-create.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Convertir los datos y el check del rol
-- ─────────────────────────────────────────────────────────────────────────
-- Se quita primero el trigger de protección (si una corrida anterior lo dejó puesto):
-- de lo contrario bloquearía la propia conversión de roles de acá abajo. Se recrea al
-- final, en la sección 4.
drop trigger if exists profiles_proteger_permisos on public.profiles;

alter table public.profiles drop constraint if exists profiles_rol_check;

do $$
begin
  -- Solo en la primera corrida: mientras exista `ve_ganancias`, ese booleano es el que
  -- decide si un superusuario queda como superadmin o como administrador.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 've_ganancias'
  ) then
    update public.profiles
       set rol = case when coalesce(ve_ganancias, false) then 'superadmin' else 'administrador' end
     where rol = 'superusuario';

    alter table public.profiles drop column ve_ganancias;
  end if;

  -- Red de seguridad: si quedara algún 'superusuario' suelto (por ejemplo creado entre
  -- el deploy y esta migración), entra como administrador. Fail-closed: sin Ganancias.
  update public.profiles set rol = 'administrador' where rol = 'superusuario';
end $$;

alter table public.profiles
  add constraint profiles_rol_check
  check (rol in ('superadmin', 'administrador', 'operador', 'cliente'));

comment on column public.profiles.rol is
  'Única fuente de verdad de permisos. superadmin = acceso total con Ganancias; '
  'administrador = acceso total sin Ganancias; operador = carga y consulta, sin editar '
  'ni borrar; cliente = solo su cuenta corriente.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Predicados de permiso — el único lugar donde vive la jerarquía
-- ─────────────────────────────────────────────────────────────────────────
-- `stable` y no `immutable`: leen una tabla. `security definer` es IMPRESCINDIBLE: sin
-- eso, una policy de `profiles` que consulte `profiles` entra en recursión infinita y la
-- app deja de cargar por completo.
--
-- En las policies se las llama SIEMPRE envueltas en un subselect —`(select es_admin())`—
-- porque Postgres no puede insertar en línea una función `security definer`: sin el
-- subselect se ejecuta una vez POR FILA, y las pantallas que leen decenas de miles de
-- filas se pasan del statement timeout.
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid()
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() in ('superadmin', 'administrador', 'superusuario'), false)
$$;

create or replace function public.es_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() in ('superadmin', 'administrador', 'operador', 'superusuario'), false)
$$;

create or replace function public.ve_ganancias()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_actual() = 'superadmin', false)
$$;

comment on function public.es_admin() is
  'administrador o superadmin. Único lugar donde se define qué es "acceso total".';
comment on function public.es_staff() is
  'operador, administrador o superadmin: todo el personal interno.';
comment on function public.ve_ganancias() is
  'Solo superadmin. El módulo de Ganancias es del dueño del negocio.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Policies reescritas sobre los predicados
-- ─────────────────────────────────────────────────────────────────────────

-- profiles — OJO: estas dos policies NO pueden consultar `profiles` con un `exists
-- (select ... from profiles)`. Esa forma es recursiva y tumba la app entera (pasó el
-- 13/8/2026: ninguna pantalla cargaba). Por eso van contra el predicado, que resuelve el
-- rol con `security definer` y corta la recursión.
drop policy if exists "Superusuarios ven todos los perfiles" on public.profiles;
drop policy if exists "Administradores ven todos los perfiles" on public.profiles;
drop policy if exists "Administradores ven todos los perfiles" on public.profiles;
create policy "Administradores ven todos los perfiles"
  on public.profiles for select using ((select public.es_admin()));

drop policy if exists "Superusuarios editan perfiles" on public.profiles;
drop policy if exists "Administradores editan perfiles" on public.profiles;
drop policy if exists "Administradores editan perfiles" on public.profiles;
create policy "Administradores editan perfiles"
  on public.profiles for update using ((select public.es_admin()));

-- cuentas_corrientes
drop policy if exists "Superusuarios gestionan cuentas" on public.cuentas_corrientes;
drop policy if exists "Administradores gestionan cuentas" on public.cuentas_corrientes;
drop policy if exists "Administradores gestionan cuentas" on public.cuentas_corrientes;
create policy "Administradores gestionan cuentas"
  on public.cuentas_corrientes for all using ((select public.es_admin()));

-- tipos_operacion
drop policy if exists "Superusuarios gestionan tipos" on public.tipos_operacion;
drop policy if exists "Administradores gestionan tipos" on public.tipos_operacion;
drop policy if exists "Administradores gestionan tipos" on public.tipos_operacion;
create policy "Administradores gestionan tipos"
  on public.tipos_operacion for all using ((select public.es_admin()));

-- clientes
drop policy if exists "Superusuarios gestionan clientes" on public.clientes;
drop policy if exists "Administradores gestionan clientes" on public.clientes;
drop policy if exists "Administradores gestionan clientes" on public.clientes;
create policy "Administradores gestionan clientes"
  on public.clientes for all using ((select public.es_admin()));

-- diario
drop policy if exists "Operadores y superusuarios ven todo" on public.diario;
drop policy if exists "Staff ve el diario" on public.diario;
drop policy if exists "Staff ve el diario" on public.diario;
create policy "Staff ve el diario"
  on public.diario for select using ((select public.es_staff()));

drop policy if exists "Operadores y superusuarios insertan" on public.diario;
drop policy if exists "Staff inserta en el diario" on public.diario;
drop policy if exists "Staff inserta en el diario" on public.diario;
create policy "Staff inserta en el diario"
  on public.diario for insert with check ((select public.es_staff()));

drop policy if exists "Superusuarios actualizan" on public.diario;
drop policy if exists "Administradores actualizan el diario" on public.diario;
drop policy if exists "Administradores actualizan el diario" on public.diario;
create policy "Administradores actualizan el diario"
  on public.diario for update using ((select public.es_admin()));

drop policy if exists "Superusuarios borran" on public.diario;
drop policy if exists "Administradores borran del diario" on public.diario;
drop policy if exists "Administradores borran del diario" on public.diario;
create policy "Administradores borran del diario"
  on public.diario for delete using ((select public.es_admin()));

-- movimientos_caja
drop policy if exists "Operadores y superusuarios ven movimientos de caja" on public.movimientos_caja;
drop policy if exists "Staff ve movimientos de caja" on public.movimientos_caja;
drop policy if exists "Staff ve movimientos de caja" on public.movimientos_caja;
create policy "Staff ve movimientos de caja"
  on public.movimientos_caja for select using ((select public.es_staff()));

drop policy if exists "Operadores y superusuarios insertan movimientos de caja" on public.movimientos_caja;
drop policy if exists "Staff inserta movimientos de caja" on public.movimientos_caja;
drop policy if exists "Staff inserta movimientos de caja" on public.movimientos_caja;
create policy "Staff inserta movimientos de caja"
  on public.movimientos_caja for insert with check ((select public.es_staff()));

drop policy if exists "Superusuarios editan movimientos de caja" on public.movimientos_caja;
drop policy if exists "Administradores editan movimientos de caja" on public.movimientos_caja;
drop policy if exists "Administradores editan movimientos de caja" on public.movimientos_caja;
create policy "Administradores editan movimientos de caja"
  on public.movimientos_caja for update
  using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists "Superusuarios eliminan movimientos de caja" on public.movimientos_caja;
drop policy if exists "Administradores eliminan movimientos de caja" on public.movimientos_caja;
drop policy if exists "Administradores eliminan movimientos de caja" on public.movimientos_caja;
create policy "Administradores eliminan movimientos de caja"
  on public.movimientos_caja for delete using ((select public.es_admin()));

-- app_config
drop policy if exists "Staff lee configuración" on public.app_config;
drop policy if exists "Staff lee configuración" on public.app_config;
create policy "Staff lee configuración"
  on public.app_config for select using ((select public.es_staff()));

drop policy if exists "Superusuarios escriben configuración" on public.app_config;
drop policy if exists "Administradores escriben configuración" on public.app_config;
drop policy if exists "Administradores escriben configuración" on public.app_config;
create policy "Administradores escriben configuración"
  on public.app_config for all
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- auditoria
drop policy if exists "Staff registra auditoría" on public.auditoria;
drop policy if exists "Staff registra auditoría" on public.auditoria;
create policy "Staff registra auditoría"
  on public.auditoria for insert with check ((select public.es_staff()));

drop policy if exists "Superusuarios leen auditoría" on public.auditoria;
drop policy if exists "Administradores leen auditoría" on public.auditoria;
drop policy if exists "Administradores leen auditoría" on public.auditoria;
create policy "Administradores leen auditoría"
  on public.auditoria for select using ((select public.es_admin()));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Protección del rol contra escritura directa
-- ─────────────────────────────────────────────────────────────────────────
-- La policy "Usuarios actualizan su propio perfil" permite update sobre la propia fila
-- sin restringir columnas. Como la clave anónima viaja en el navegador, cualquier
-- usuario logueado podía escribirse `rol` llamando directo a PostgREST, sin pasar por la
-- app. Este trigger lo impide. Las rutas de administración usan la clave de servicio y
-- quedan exceptuadas: ahí las reglas las aplica el servidor
-- (src/app/api/admin/usuarios/[id]/route.ts).
create or replace function public.profiles_proteger_permisos()
returns trigger language plpgsql as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if new.rol        is distinct from old.rol
  or new.activo     is distinct from old.activo
  or new.cuenta_cte is distinct from old.cuenta_cte then
    raise exception
      'El rol y el estado de un usuario solo se modifican desde la pantalla de Usuarios'
      using errcode = '42501';   -- insufficient_privilege
  end if;

  return new;
end;
$$;

comment on function public.profiles_proteger_permisos() is
  'Impide que un usuario se cambie el rol escribiendo directo contra la API REST con la '
  'clave anónima. Las rutas de administración usan la clave de servicio y no pasan por acá.';

drop trigger if exists profiles_proteger_permisos on public.profiles;
drop trigger if exists profiles_proteger_permisos on public.profiles;
create trigger profiles_proteger_permisos
  before update on public.profiles
  for each row execute function public.profiles_proteger_permisos();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Funciones heredadas
-- ─────────────────────────────────────────────────────────────────────────
-- `crear_usuario_admin` y `admin_cambiar_clave` (schema.sql) comparan contra el rol
-- 'superusuario', que ya no existe: quedan fail-closed, rechazando a todo el mundo. No
-- las usa la app —el alta y el reseteo de clave van por /api/admin/usuarios— así que se
-- las deja bloqueadas a propósito en lugar de reactivarlas.

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Verificación
-- ─────────────────────────────────────────────────────────────────────────
select email, nombre, rol from public.profiles order by rol, nombre;


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-08-25_clientes_ultimo_movimiento.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Inicio: fecha del ultimo movimiento de cada cliente (25/8/2026).
--
-- La tabla de clientes del tablero lista TODOS los clientes en orden alfabetico, y son
-- mas de 1.000. El que opero ayer queda enterrado entre cientos que no aparecen hace un
-- anio. Con esta fecha, la pantalla puede mostrar primero a los activos y esconder al
-- resto, sin perderlos: siguen apareciendo al buscarlos por nombre.
--
-- Es SEGURO correr esta migracion dos veces (create or replace / drop-create).
--
-- Los comentarios van sin acentos ni guiones largos a proposito: el SQL Editor de
-- Supabase rompe la linea al pegar esos caracteres y la consulta falla.

-- Totales de CAJA por cliente, con la fecha de su ultimo movimiento.
--
-- Se borra primero: la funcion ya existia y ahora devuelve una columna mas, y Postgres
-- no permite cambiar las columnas de salida con create or replace.
drop function if exists public.caja_clientes_periodo(date, date);

create function public.caja_clientes_periodo(p_desde date default null, p_hasta date default null)
returns table(
  cliente text, pesos numeric, dolares numeric, euros numeric, reales numeric,
  movimientos bigint, ultimo_movimiento date
)
language sql
stable
as $$
  select
    cliente,
    sum(pesos)   as pesos,
    sum(dolares) as dolares,
    sum(euros)   as euros,
    sum(reales)  as reales,
    count(*)     as movimientos,
    max(fecha)   as ultimo_movimiento
  from public.movimientos_caja
  where operacion <> 'OPERACION?'
    and cliente is not null
    and btrim(cliente) <> ''
    and (p_desde is null or fecha >= p_desde)
    and (p_hasta is null or fecha <= p_hasta)
  group by cliente;
$$;

-- Misma informacion en la vista de respaldo: la pantalla cae a esta vista si la
-- funcion no esta disponible.
drop view if exists public.caja_clientes;
create view public.caja_clientes
with (security_invoker = true) as
select
  cliente,
  sum(pesos)   as pesos,
  sum(dolares) as dolares,
  sum(euros)   as euros,
  sum(reales)  as reales,
  count(*)     as movimientos,
  max(fecha)   as ultimo_movimiento
from public.movimientos_caja
where operacion <> 'OPERACION?'
  and cliente is not null
  and btrim(cliente) <> ''
group by cliente;


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-08-25_indice_fila_sheet.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Índice para el orden de la pantalla Transacciones (25/8/2026).
--
-- El listado pasa a ordenarse por `fila_sheet` descendente —la secuencia de la planilla,
-- dada vuelta— en lugar de por fecha. Sin índice, cada página obliga a ordenar las más de
-- 35.000 filas de la tabla.
--
-- Es SEGURO correrla dos veces.

create index if not exists movimientos_caja_fila_sheet_idx
  on public.movimientos_caja (fila_sheet desc nulls first);


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-08-25_usdt_cta_cte.sql
-- ══════════════════════════════════════════════════════════════════════════

-- USDT en CUENTA CORRIENTE (25/8/2026).
--
-- Cambia la regla del 20/7/2026, que limitaba USDT a operaciones de CAJA. El motivo por
-- el que se había limitado —que USDT no existe en la planilla— sigue siendo cierto, pero
-- no es un impedimento: NO hay ni una transacción con USDT cargada en el Sheet y no la va
-- a haber. Es una moneda que nace con la app.
--
-- Consecuencia a tener presente: los saldos USDT de cuenta corriente viven SOLO en la
-- app. Si alguna vez hay que reconstruir desde el Sheet, no están ahí.
--
-- Es SEGURO correr esta migración dos veces.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. La columna, en las dos tablas
-- ─────────────────────────────────────────────────────────────────────────
alter table public.movimientos_caja
  add column if not exists cc_usdt numeric(18,2) not null default 0;

alter table public.diario
  add column if not exists cc_usdt numeric(18,2);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Proteger de la sincronización lo que carga la app
-- ─────────────────────────────────────────────────────────────────────────
-- El sync full borra las filas de cuenta corriente de `diario` y las reinserta desde el
-- Sheet. `movimientos_caja` ya se protegía con `origen`, pero `diario` no: borraba TODO.
-- Sin esta columna, la primera sincronización se llevaría puestos los saldos USDT —y
-- también cualquier movimiento de cta cte cargado en la app cuya escritura al Sheet haya
-- fallado, que es un agujero que ya existía.
alter table public.diario
  add column if not exists origen text not null default 'sheet';

comment on column public.diario.origen is
  'sheet = vino de la planilla y el sync lo puede regenerar. app = se cargó en la app y '
  'NO existe en el Sheet (USDT y cualquier alta cuya replicación al Sheet haya fallado): '
  'el sync no lo toca, porque si lo borrara no habría forma de recuperarlo.';

create index if not exists diario_origen_idx on public.diario (origen);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. La vista de saldos suma también USDT
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.saldos_cuenta_corriente;
drop view if exists public.saldos_cuenta_corriente cascade;
create or replace view public.saldos_cuenta_corriente as
select
  cuenta_cte,
  sum(cc_pesos)             as saldo_pesos,
  sum(cc_dolares)           as saldo_dolares,
  sum(cc_euros)             as saldo_euros,
  sum(cc_reales)            as saldo_reales,
  sum(coalesce(cc_usdt, 0)) as saldo_usdt,
  max(fecha)                as ultimo_movimiento
from public.diario
where anulado = false and tipo = 'CTA CTE'
group by cuenta_cte;

comment on view public.saldos_cuenta_corriente is
  'Saldo por cuenta corriente. USDT solo puede venir de la app: en la planilla no existe.';


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-08-25_cta_cte_paginado.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Cuentas Corrientes: una página con el saldo acumulado ya calculado (25/8/2026).
--
-- QUÉ PROBLEMA RESUELVE
-- La pantalla traía TODOS los movimientos de la cuenta —7.661 en la más grande, con
-- todas sus columnas y en 8 viajes a la base—, calculaba el saldo acumulado fila por fila
-- en el servidor y después mandaba las 7.661 filas al navegador. De ahí la demora.
--
-- Con esta función es UN viaje que devuelve solo la página pedida, con el acumulado ya
-- resuelto por la base.
--
-- POR QUÉ EL ACUMULADO NO SE PUEDE CALCULAR SOBRE LA PÁGINA
-- El saldo de una fila es el de TODOS los movimientos hasta esa fecha, no el de los que
-- entraron en pantalla. Por eso la ventana recorre la cuenta entera en orden cronológico
-- y recién después se aplica el filtro de fechas y se corta la página. Es lo mismo que
-- antes hacía el "saldo previo al rango", pero en una sola pasada.
--
-- Es SEGURO correr esta migración dos veces.

-- Índice para la ventana: la función siempre entra por cuenta y ordena por fecha.
create index if not exists diario_cta_cte_fecha_idx
  on public.diario (cuenta_cte, fecha)
  where tipo = 'CTA CTE' and anulado = false;

drop function if exists public.cta_cte_movimientos(text, date, date, text, integer, integer);

create or replace function public.cta_cte_movimientos(
  p_cuenta    text,
  p_desde     date default null,
  p_hasta     date default null,
  p_operacion text default null,   -- 'INGRESO' | 'EGRESO' | null
  p_limit     integer default 200,
  p_offset    integer default 0
)
returns table (
  id           uuid,
  fecha        date,
  cuenta_cte   text,
  operacion    text,
  concepto     text,
  evento       text,
  notas        text,
  moneda       text,
  monto        numeric,
  cc_pesos     numeric,
  cc_dolares   numeric,
  cc_euros     numeric,
  cc_reales    numeric,
  cc_usdt      numeric,
  acum_pesos   numeric,
  acum_dolares numeric,
  acum_euros   numeric,
  acum_reales  numeric,
  acum_usdt    numeric,
  total_filas  bigint
)
language sql
stable
security invoker   -- respeta la RLS de `diario`: un cliente solo ve su propia cuenta
set search_path = public
as $$
  with todos as (
    select
      d.id, d.fecha, d.cuenta_cte, d.operacion, d.concepto, d.evento, d.notas,
      d.moneda, d.monto, d.created_at,
      d.cc_pesos, d.cc_dolares, d.cc_euros, d.cc_reales, d.cc_usdt,
      -- Acumulado desde el primer movimiento de la cuenta hasta esta fila.
      sum(coalesce(d.cc_pesos, 0))   over w as acum_pesos,
      sum(coalesce(d.cc_dolares, 0)) over w as acum_dolares,
      sum(coalesce(d.cc_euros, 0))   over w as acum_euros,
      sum(coalesce(d.cc_reales, 0))  over w as acum_reales,
      sum(coalesce(d.cc_usdt, 0))    over w as acum_usdt
    from public.diario d
    where d.tipo = 'CTA CTE'
      and d.anulado = false
      and d.cuenta_cte = p_cuenta
    -- `id` como desempate final: sin él, dos filas del mismo día y el mismo instante
    -- podrían ordenarse distinto entre llamadas y el acumulado bailaría.
    window w as (order by d.fecha, d.created_at, d.id rows between unbounded preceding and current row)
  ),
  filtrado as (
    select * from todos t
    where (p_desde is null or t.fecha >= p_desde)
      and (p_hasta is null or t.fecha <= p_hasta)
      -- El filtro es por DIRECCIÓN, no por un código exacto: conviven INGRESAN/EGRESAN
      -- con los valores viejos DONACION/COMPROMISO. "INGRES" no es subcadena de
      -- "EGRESAN" ni viceversa, así que no se pisan.
      and (
        p_operacion is null
        or (p_operacion = 'INGRESO' and (t.operacion ilike '%INGRES%' or t.operacion = 'DONACION'))
        or (p_operacion = 'EGRESO'  and (t.operacion ilike '%EGRES%'  or t.operacion = 'COMPROMISO'))
      )
  )
  -- Se listan las columnas una por una: `f.*` arrastraría `created_at`, que se usa para
  -- ordenar pero no forma parte de lo que devuelve la función.
  select
    f.id, f.fecha, f.cuenta_cte, f.operacion, f.concepto, f.evento, f.notas,
    f.moneda, f.monto,
    f.cc_pesos, f.cc_dolares, f.cc_euros, f.cc_reales, f.cc_usdt,
    f.acum_pesos, f.acum_dolares, f.acum_euros, f.acum_reales, f.acum_usdt,
    count(*) over () as total_filas
  from filtrado f
  -- Exactamente al revés que la ventana, para que la pantalla muestre lo más nuevo arriba
  -- y el acumulado de cada fila sea el que le corresponde.
  order by f.fecha desc, f.created_at desc, f.id desc
  limit p_limit offset p_offset
$$;

comment on function public.cta_cte_movimientos(text, date, date, text, integer, integer) is
  'Una página de movimientos de una cuenta corriente, con el saldo acumulado por fila ya '
  'calculado. El acumulado se resuelve sobre la cuenta COMPLETA y recién después se '
  'aplica el filtro de fechas: el saldo de una fila es el de todo lo anterior, no el de '
  'lo que entró en pantalla.';


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-08-26_op_transferencias.sql
-- ══════════════════════════════════════════════════════════════════════════

-- Transferencias: traer el marcador OP y la OPERACION EXTERNA de la planilla (26/8/2026).
--
-- QUE PROBLEMA RESUELVE
-- El cliente marca las transferencias poniendo "T" en la columna OP de la planilla y
-- escribe los participantes en NOTAS. Con eso armaba la tabla dinamica RESULTADO TT.
--
-- El sync nunca leyo esa columna y la base no tenia donde guardarla, asi que en la app
-- no habia forma de saber cual movimiento es una transferencia. Lo mismo con OPERACION
-- EXTERNA, que era una de las filas de esa tabla dinamica.
--
-- DESPUES DE CORRER ESTO HAY QUE CORRER UN SYNC FULL
-- Las columnas quedan vacias hasta que el sync vuelva a leer la planilla. Un sync full
-- desde GitHub Actions (workflow "Sincronizar CAJA", modo full) las completa.
--
-- Es SEGURO correr esta migracion dos veces.
--
-- Los comentarios van sin acentos a proposito: el SQL Editor de Supabase rompe la linea
-- al pegar acentos y guiones largos.

alter table public.movimientos_caja
  add column if not exists op                text,
  add column if not exists operacion_externa text;

comment on column public.movimientos_caja.op is
  'Marcador de la columna OP de la planilla. "T" = la fila es parte de una transferencia; '
  '"C" = operacion comun. Los participantes de la transferencia van en NOTAS.';

comment on column public.movimientos_caja.operacion_externa is
  'Columna OPERACION EXTERNA de la planilla: la contrapartida de OPERACION. Se usa en el '
  'listado de transferencias.';

-- La pantalla de transferencias entra siempre por op = 'T'. Indice parcial: las filas
-- con "C" son la enorme mayoria y no hace falta indexarlas.
create index if not exists idx_mcaja_op_t
  on public.movimientos_caja (fecha desc)
  where op = 'T';


-- ══════════════════════════════════════════════════════════════════════════
-- migrations/2026-09-11_senal_cambios.sql
-- ══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- Senal de cambios: una consulta baratisima para saber si hay algo nuevo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- La pantalla de Inicio se refrescaba sola cada 60 segundos. El problema no era el
-- refresco en si, sino QUE recalculaba: los totales del listado se computan trayendo
-- todas las filas que coinciden con el filtro, asi que sin filtros se recorria la tabla
-- entera, cada minuto, por cada pestaña abierta. Y el 99% de las veces no habia cambiado
-- nada.
--
-- Ahora el navegador primero pregunta por esta señal. Si no cambio, no hace nada. El
-- refresco caro ocurre solo cuando de verdad hubo un movimiento.
--
-- QUE MIRA, Y POR QUE MIRA DOS COSAS
--   1. auditoria.ts    -> alta, edicion y borrado hechos DESDE LA APP. Es un indice
--                         (auditoria_ts_idx, ts desc), asi que max() se resuelve leyendo
--                         una sola entrada del indice.
--   2. movimientos_caja.creado_at -> lo que trae el SYNC desde la planilla. El sync lee
--                         la auditoria pero no escribe en ella, asi que sin esta segunda
--                         parte los movimientos que llegan por sincronizacion no
--                         dispararian ningun refresco.
--
-- LIMITE CONOCIDO: un borrado hecho por el sync (no por la app) no mueve ninguno de los
-- dos valores. Es el unico camino que queda sin cubrir; se resuelve al navegar o al
-- recargar, igual que antes.
--
-- SECURITY DEFINER: la lectura de `auditoria` esta restringida por RLS a superusuario, y
-- esta señal la necesitan tambien operadores y administradores. La funcion no expone
-- ningun dato: devuelve dos marcas de tiempo, nada mas.
--
-- Es SEGURO correr esta migracion dos veces.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Indice para que max(creado_at) no recorra la tabla
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists idx_mcaja_creado_at
  on public.movimientos_caja (creado_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. La señal
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.senal_cambios()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select max(ts)::text         from public.auditoria), '')
      || '|'
      || coalesce((select max(creado_at)::text  from public.movimientos_caja), '');
$$;

comment on function public.senal_cambios() is
  'Marca que cambia cuando hay movimientos nuevos, editados o borrados desde la app, o '
  'cuando el sync trae filas de la planilla. La usa el refresco automatico de Inicio '
  'para no recalcular la pantalla cuando no paso nada.';

revoke all on function public.senal_cambios() from public;
grant execute on function public.senal_cambios() to authenticated;

