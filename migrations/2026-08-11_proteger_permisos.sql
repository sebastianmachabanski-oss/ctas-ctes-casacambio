-- Protección de roles y permisos en `profiles`.
--
-- EL AGUJERO QUE CIERRA
-- La policy "Usuarios actualizan su propio perfil" permite `update` sobre la propia
-- fila con `using (auth.uid() = id)` y sin restricción de columnas. Como la clave
-- anónima de Supabase viaja en el navegador, CUALQUIER usuario logueado —operador o
-- cliente, no hace falta ser superusuario— podía llamar a la API REST y escribirse
--   { "rol": "superusuario", "ve_ganancias": true }
-- sobre su propio perfil. Las validaciones de la app no intervienen: el pedido va
-- directo a PostgREST.
--
-- CÓMO SE CIERRA
-- Un trigger BEFORE UPDATE rechaza cualquier cambio de rol / permisos / estado hecho
-- desde una sesión de usuario. Las rutas de administración de la app siguen andando
-- porque usan la clave de servicio (`service_role`), que sí queda habilitada — ahí las
-- reglas de quién puede otorgar qué las aplica el servidor
-- (src/app/api/admin/usuarios/[id]/route.ts).
--
-- Es SEGURO correr esta migración dos veces (create or replace / drop if exists).

create or replace function public.profiles_proteger_permisos()
returns trigger
language plpgsql
as $$
begin
  -- Sesiones administrativas: la app (service_role), el SQL Editor y los procesos de
  -- mantenimiento de Supabase. Las reglas de negocio se aplican en la capa de la app.
  if current_user in ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  if new.rol          is distinct from old.rol
  or new.ve_ganancias is distinct from old.ve_ganancias
  or new.activo       is distinct from old.activo
  or new.cuenta_cte   is distinct from old.cuenta_cte then
    raise exception
      'El rol, los permisos y el estado de un usuario solo se modifican desde la pantalla de Usuarios'
      using errcode = '42501';   -- insufficient_privilege
  end if;

  return new;
end;
$$;

comment on function public.profiles_proteger_permisos() is
  'Impide que un usuario se cambie el rol o se otorgue permisos escribiendo directo '
  'contra la API REST con la clave anónima. Las rutas de administración usan la clave '
  'de servicio y no pasan por esta restricción.';

drop trigger if exists profiles_proteger_permisos on public.profiles;
create trigger profiles_proteger_permisos
  before update on public.profiles
  for each row execute function public.profiles_proteger_permisos();
