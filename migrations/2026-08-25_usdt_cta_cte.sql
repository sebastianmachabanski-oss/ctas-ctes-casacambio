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
