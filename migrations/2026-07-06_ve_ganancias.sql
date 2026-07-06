-- Permiso "superadmin" para el módulo de Ganancias: asignable POR USUARIO desde la
-- pantalla de Usuarios (no alcanza con el rol superusuario — el dueño debe poder verlo
-- y otros usuarios del staff no necesariamente). Nadie lo tiene por defecto.
alter table public.profiles
  add column if not exists ve_ganancias boolean not null default false;

comment on column public.profiles.ve_ganancias is
  'Acceso al módulo de Ganancias (permiso superadmin, independiente del rol). '
  'Se asigna individualmente desde Usuarios; por defecto nadie lo tiene.';
