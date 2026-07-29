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
create policy "Staff registra auditoría"
  on public.auditoria for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.rol in ('superusuario', 'operador')
    )
  );

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
