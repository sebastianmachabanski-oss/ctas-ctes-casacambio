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
-- `stable` y no `immutable`: leen una tabla. `security definer` para que puedan
-- consultar `profiles` sin quedar atrapadas en la RLS de la propia tabla.
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

comment on function public.es_admin() is
  'administrador o superadmin. Único lugar donde se define qué es "acceso total".';
comment on function public.es_staff() is
  'operador, administrador o superadmin: todo el personal interno.';
comment on function public.ve_ganancias() is
  'Solo superadmin. El módulo de Ganancias es del dueño del negocio.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Policies reescritas sobre los predicados
-- ─────────────────────────────────────────────────────────────────────────

-- profiles
drop policy if exists "Superusuarios ven todos los perfiles" on public.profiles;
drop policy if exists "Administradores ven todos los perfiles" on public.profiles;
create policy "Administradores ven todos los perfiles"
  on public.profiles for select using (public.es_admin());

drop policy if exists "Superusuarios editan perfiles" on public.profiles;
drop policy if exists "Administradores editan perfiles" on public.profiles;
create policy "Administradores editan perfiles"
  on public.profiles for update using (public.es_admin());

-- cuentas_corrientes
drop policy if exists "Superusuarios gestionan cuentas" on public.cuentas_corrientes;
drop policy if exists "Administradores gestionan cuentas" on public.cuentas_corrientes;
create policy "Administradores gestionan cuentas"
  on public.cuentas_corrientes for all using (public.es_admin());

-- tipos_operacion
drop policy if exists "Superusuarios gestionan tipos" on public.tipos_operacion;
drop policy if exists "Administradores gestionan tipos" on public.tipos_operacion;
create policy "Administradores gestionan tipos"
  on public.tipos_operacion for all using (public.es_admin());

-- clientes
drop policy if exists "Superusuarios gestionan clientes" on public.clientes;
drop policy if exists "Administradores gestionan clientes" on public.clientes;
create policy "Administradores gestionan clientes"
  on public.clientes for all using (public.es_admin());

-- diario
drop policy if exists "Operadores y superusuarios ven todo" on public.diario;
drop policy if exists "Staff ve el diario" on public.diario;
create policy "Staff ve el diario"
  on public.diario for select using (public.es_staff());

drop policy if exists "Operadores y superusuarios insertan" on public.diario;
drop policy if exists "Staff inserta en el diario" on public.diario;
create policy "Staff inserta en el diario"
  on public.diario for insert with check (public.es_staff());

drop policy if exists "Superusuarios actualizan" on public.diario;
drop policy if exists "Administradores actualizan el diario" on public.diario;
create policy "Administradores actualizan el diario"
  on public.diario for update using (public.es_admin());

drop policy if exists "Superusuarios borran" on public.diario;
drop policy if exists "Administradores borran del diario" on public.diario;
create policy "Administradores borran del diario"
  on public.diario for delete using (public.es_admin());

-- movimientos_caja
drop policy if exists "Operadores y superusuarios ven movimientos de caja" on public.movimientos_caja;
drop policy if exists "Staff ve movimientos de caja" on public.movimientos_caja;
create policy "Staff ve movimientos de caja"
  on public.movimientos_caja for select using (public.es_staff());

drop policy if exists "Operadores y superusuarios insertan movimientos de caja" on public.movimientos_caja;
drop policy if exists "Staff inserta movimientos de caja" on public.movimientos_caja;
create policy "Staff inserta movimientos de caja"
  on public.movimientos_caja for insert with check (public.es_staff());

drop policy if exists "Superusuarios editan movimientos de caja" on public.movimientos_caja;
drop policy if exists "Administradores editan movimientos de caja" on public.movimientos_caja;
create policy "Administradores editan movimientos de caja"
  on public.movimientos_caja for update
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Superusuarios eliminan movimientos de caja" on public.movimientos_caja;
drop policy if exists "Administradores eliminan movimientos de caja" on public.movimientos_caja;
create policy "Administradores eliminan movimientos de caja"
  on public.movimientos_caja for delete using (public.es_admin());

-- app_config
drop policy if exists "Staff lee configuración" on public.app_config;
create policy "Staff lee configuración"
  on public.app_config for select using (public.es_staff());

drop policy if exists "Superusuarios escriben configuración" on public.app_config;
drop policy if exists "Administradores escriben configuración" on public.app_config;
create policy "Administradores escriben configuración"
  on public.app_config for all
  using (public.es_admin()) with check (public.es_admin());

-- auditoria
drop policy if exists "Staff registra auditoría" on public.auditoria;
create policy "Staff registra auditoría"
  on public.auditoria for insert with check (public.es_staff());

drop policy if exists "Superusuarios leen auditoría" on public.auditoria;
drop policy if exists "Administradores leen auditoría" on public.auditoria;
create policy "Administradores leen auditoría"
  on public.auditoria for select using (public.es_admin());

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
