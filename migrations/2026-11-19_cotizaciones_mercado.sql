-- Cotizaciones de MERCADO: el referencial externo contra el que se mide si se compró y
-- se vendió bien. Nada de esto sale de los datos del sistema.
--
-- ES SEGURO CORRERLA DOS VECES: todo va con `if not exists` / `create or replace`, y las
-- policies se borran antes de crearse.
--
-- ── POR QUÉ UNA COLUMNA `fuente` Y NO UNA TABLA POR SITIO ──────────────────
-- Porque todavía no sabemos cuál sirve. El cliente mira dolarhoy, que NO tiene API y hay
-- que leer scrapeando su HTML. El día que se eligió, dolarhoy y dolarapi —que sí es una
-- API— daban exactamente el mismo blue (1.620 / 1.640) y el mismo oficial (1.535 / 1.585),
-- con cinco minutos de diferencia entre lecturas. Si eso se sostiene un par de semanas, el
-- lector de HTML sobra y se tira.
--
-- Así que se guardan las tres en paralelo y se mide, en vez de decidir por intuición:
--   dolarhoy     la que mira el cliente. Intradiaria, compra y venta, dólar/euro/real.
--   dolarapi     API, intradiaria, y la única con USDT —que dolarhoy no publica—.
--   monitorargy  API con quince años de historia diaria. Una foto por la mañana, y solo
--                la venta: no sirve para el momento, sí para llenar el pasado.
--
-- Cuando la medición decida, sacar una fuente es dejar de escribirla. La tabla no cambia.
--
-- ── POR QUÉ DOS FECHAS ─────────────────────────────────────────────────────
-- `tomada_en` es cuándo la leímos nosotros. `actualizado` es cuándo dice LA FUENTE que se
-- actualizó. Sin la segunda, una fuente congelada es indistinguible de un mercado quieto:
-- las dos se ven como un valor que no cambia.

create table if not exists public.cotizaciones_mercado (
  id                bigserial primary key,
  tomada_en         timestamptz not null default now(),
  fuente            text        not null,
  -- Moneda normalizada entre fuentes: cada sitio la nombra distinto —la página del blue de
  -- dolarhoy se titula "Dólar Libre"— y sin esto no se pueden comparar.
  clave             text        not null,
  compra            numeric(18,4),
  -- Nulo a propósito en monitorargy, que publica un solo valor y declara que es la venta.
  -- Inventar la compra restándole un spread sería fabricar un dato de mercado.
  venta             numeric(18,4),
  actualizado       timestamptz,
  -- El texto crudo tal como lo publica la fuente ("19/11/26 06:24 PM"). Para diagnosticar
  -- el día que la conversión de fecha empiece a dar cualquier cosa.
  actualizado_texto text,
  creado_at         timestamptz not null default now()
);

comment on table public.cotizaciones_mercado is
  'Cotizaciones de referencia de fuentes externas (dolarhoy, dolarapi, monitorargy). '
  'Se guardan las tres en paralelo para medir cuánto se separan. Ver src/lib/cotizaciones.';
comment on column public.cotizaciones_mercado.tomada_en is 'Cuándo la leímos nosotros.';
comment on column public.cotizaciones_mercado.actualizado is
  'Cuándo dice la FUENTE que se actualizó. Es lo que delata una fuente congelada.';

-- Solo se escribe cuando el valor CAMBIÓ respecto de la última fila de esa fuente y esa
-- moneda (lo decide quien escribe, no la base). Una foto cada 15 minutos durante un año
-- serían cientos de miles de filas casi todas repetidas; así la tabla es la historia de
-- los cambios, que además es lo que se quiere consultar.
create index if not exists idx_cotiz_clave_fecha
  on public.cotizaciones_mercado (clave, tomada_en desc);
create index if not exists idx_cotiz_fuente_clave_fecha
  on public.cotizaciones_mercado (fuente, clave, tomada_en desc);

-- ─────────────────────────────────────────────────────────────────────────
-- Permisos
-- ─────────────────────────────────────────────────────────────────────────
-- Lectura para el staff: es un dato de referencia, no hay nada sensible. ESCRITURA PARA
-- NADIE: la única que escribe es la función programada, que usa el service role y no pasa
-- por las policies. Sin policy de insert, ningún usuario puede meter una cotización a mano
-- y hacerla pasar por dato de mercado.
alter table public.cotizaciones_mercado enable row level security;

drop policy if exists "Staff lee cotizaciones de mercado" on public.cotizaciones_mercado;
create policy "Staff lee cotizaciones de mercado"
  on public.cotizaciones_mercado for select
  using (public.es_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- Verificación
-- ─────────────────────────────────────────────────────────────────────────
-- Tiene que devolver la tabla con sus dos índices y una sola policy, de select.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'cotizaciones_mercado')  as tabla,
  (select count(*) from pg_indexes
    where schemaname = 'public' and tablename = 'cotizaciones_mercado')     as indices,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'cotizaciones_mercado')     as policies;
