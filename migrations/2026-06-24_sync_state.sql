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
