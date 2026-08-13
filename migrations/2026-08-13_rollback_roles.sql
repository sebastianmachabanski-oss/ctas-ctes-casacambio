-- ROLLBACK del modelo de cuatro roles — acompaña al revert del código (13/8/2026).
--
-- POR QUÉ HACE FALTA
-- El código volvió al modelo viejo (`superusuario` + columna `ve_ganancias`), pero la
-- base ya está migrada al nuevo. Sin esta migración NADIE tendría acceso a nada: el
-- código compara contra 'superusuario', un valor que en la base ya no existe.
-- CORRERLA INMEDIATAMENTE DESPUÉS DEL DEPLOY DEL REVERT.
--
-- QUÉ NO DESHACE, A PROPÓSITO
-- Las policies siguen llamando a `es_admin()` / `es_staff()` / `ve_ganancias()`; lo que
-- se cambia es la DEFINICIÓN de esas funciones, para que expresen el modelo viejo. Así
-- no hay que recrear veinte policies y el rollback es corto y reversible.
-- También se CONSERVA el trigger `profiles_proteger_permisos`: cierra el agujero de
-- escribirse el rol directo contra PostgREST y no interfiere con el código viejo, que
-- administra usuarios con la clave de servicio.
--
-- Es SEGURO correrla dos veces.

-- 1. Volver la columna de permiso individual, derivada del rol actual.
alter table public.profiles
  add column if not exists ve_ganancias boolean not null default false;

update public.profiles set ve_ganancias = true  where rol = 'superadmin';
update public.profiles set ve_ganancias = false where rol = 'administrador';

-- 2. Volver los roles al vocabulario viejo.
alter table public.profiles drop constraint if exists profiles_rol_check;

update public.profiles set rol = 'superusuario' where rol in ('superadmin', 'administrador');

alter table public.profiles
  add constraint profiles_rol_check
  check (rol in ('superusuario', 'operador', 'cliente'));

-- 3. Redefinir los predicados con el modelo viejo. Las policies no se tocan.
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.profiles where id = auth.uid()) = 'superusuario', false)
$$;

create or replace function public.es_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select rol from public.profiles where id = auth.uid()) in ('superusuario', 'operador'), false)
$$;

create or replace function public.ve_ganancias()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select ve_ganancias from public.profiles where id = auth.uid()), false)
$$;

-- 4. Verificación: dejar a la vista cómo quedó cada usuario.
select email, nombre, rol, ve_ganancias from public.profiles order by rol, nombre;
