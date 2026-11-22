-- CHEQUES COMO INSTRUMENTO, NO COMO MONEDA (22/11/2026).
--
-- ── QUÉ PROBLEMA RESUELVE ─────────────────────────────────────────────────
-- Hoy un cheque es un importe en la columna CHEQUES de `movimientos_caja`. Eso
-- alcanza para el margen del descuento —la cartera se valúa a nominal y la ganancia
-- se reconoce al tomar el documento, criterio del 11/8/2026— pero no para contestar
-- la pregunta que hace una casa que descuenta cheques: QUÉ cheques tengo, CUÁNDO
-- vencen y EN QUÉ ESTADO están.
--
-- Mil dólares son mil dólares. Un cheque es un objeto específico: librador, banco,
-- número, importe, fecha de pago y un estado que cambia en el tiempo. Un importe en
-- una columna no puede guardar eso por más bien que se lea la foto.
--
-- ── LAS DOS TABLAS ────────────────────────────────────────────────────────
--   `cheques`          el instrumento, colgado de la operación que lo trajo
--   `cheques_eventos`  su curso: cómo llegó al estado en el que está
--
-- Una operación trae N cheques: el cliente llega con cinco y se lleva un solo pago.
-- Por eso los cheques cuelgan del movimiento y no al revés.
--
-- ── LA PLATA NO SE DUPLICA ────────────────────────────────────────────────
-- Los importes siguen viviendo en `movimientos_caja`. Estas tablas guardan el
-- instrumento, no una segunda contabilidad. `cheques_descuadrados()` existe para
-- avisar si las dos se despegan, que es la misma clase de regla que valida
-- `scripts/validar-posicion.mts`: dos lugares que muestran lo mismo y tienen que
-- coincidir.
--
-- ── ESTAS FILAS NACEN EN LA APP ───────────────────────────────────────────
-- Igual que USDT, el Sheet no las tiene y no las va a tener. En una instancia con
-- sync activo queda pendiente decidir qué pasa si el sync reescribe el movimiento al
-- que un cheque está atado. No se resuelve acá: hoy ese caso no existe (el cliente
-- actual no opera cheques y los clientes nuevos no tienen planilla).
--
-- Es SEGURO correr esta migración dos veces.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. El instrumento
-- ═════════════════════════════════════════════════════════════════════════
create table if not exists public.cheques (
  id            uuid primary key default gen_random_uuid(),

  -- De qué operación vino. RESTRICT y no CASCADE a propósito: borrar un movimiento
  -- que tiene cheques con historia (depositado, rechazado) se llevaría el registro
  -- sin avisar, que es exactamente el accidente que ya pasó con `diario` el
  -- 1/9/2026. Que falle, y que lo resuelva la pantalla diciendo por qué.
  movimiento_id uuid not null references public.movimientos_caja(id) on delete restrict,

  -- 'papel' y 'echeq' son el MISMO instrumento con distinta puerta de entrada: los
  -- campos que importan (librador, importe, fecha de pago, estado) son los mismos, y
  -- separarlos en dos tablas duplicaría el calendario, los estados, las alertas y
  -- todos los reportes. Lo que cambia es de dónde salen los datos.
  tipo          text not null default 'papel',
  estado        text not null default 'en_cartera',

  -- El instrumento
  numero        text not null,
  importe       numeric(18,2) not null,
  fecha_emision date,
  -- La fecha que arma el calendario. En un cheque "al día" es igual a la de emisión:
  -- no es un caso aparte, es el mismo modelo con el calendario vacío.
  fecha_pago    date not null,

  -- Quién lo libró. `cuit_librador` es lo que permite medir concentración, que es el
  -- riesgo real del negocio: no importa tener muchos cheques, importa tener muchos
  -- del mismo.
  librador      text,
  cuit_librador text,
  banco         text,
  sucursal      text,
  cuenta        text,

  -- De dónde salieron los datos
  cmc7          text,   -- solo papel: la banda de abajo, la parte legible a máquina
  id_echeq      text,   -- solo echeq: el identificador de COELSA
  archivo_url   text,   -- la foto del cheque o el archivo del echeq
  origen_datos  text not null default 'manual',

  notas         text,
  creado_en     timestamptz not null default now(),
  creado_por    uuid references auth.users(id),

  constraint cheques_tipo_ok     check (tipo in ('papel', 'echeq')),
  constraint cheques_estado_ok   check (estado in
    ('en_cartera', 'depositado', 'acreditado', 'rechazado', 'endosado', 'devuelto')),
  constraint cheques_importe_ok  check (importe > 0),
  constraint cheques_fechas_ok   check (fecha_emision is null or fecha_pago >= fecha_emision),
  constraint cheques_origen_ok   check (origen_datos in ('manual', 'ocr', 'archivo'))
);

comment on table public.cheques is
  'Un cheque concreto, colgado de la operación que lo trajo. La PLATA vive en '
  'movimientos_caja: acá está el instrumento. Una operación puede traer varios.';
comment on column public.cheques.fecha_pago is
  'La fecha a partir de la cual se puede cobrar. Es la que arma el calendario de '
  'vencimientos. En un cheque al día coincide con la de emisión.';
comment on column public.cheques.estado is
  'El estado de HOY, para consultar rápido. Cómo llegó hasta acá está en '
  'cheques_eventos; los dos se escriben juntos.';
comment on column public.cheques.cuit_librador is
  'Permite medir concentración por librador, que es el riesgo propio de descontar '
  'cheques: diez cheques de un mismo librador son un solo riesgo, no diez.';

-- El calendario de vencimientos es la consulta de todos los días: índice parcial,
-- porque lo acreditado y lo devuelto ya no se miran.
create index if not exists cheques_fecha_pago_idx on public.cheques (fecha_pago)
  where estado in ('en_cartera', 'depositado');
create index if not exists cheques_estado_idx     on public.cheques (estado);
create index if not exists cheques_movimiento_idx on public.cheques (movimiento_id);
create index if not exists cheques_cuit_idx       on public.cheques (cuit_librador)
  where cuit_librador is not null;

-- Un echeq es único de verdad. Un cheque PAPEL no: el mismo número se repite entre
-- bancos, y uno rechazado puede volver a entrar legítimamente. Ahí la pantalla avisa
-- del posible duplicado en vez de impedirlo — con cero o varias coincidencias se
-- avisa, no se adivina, igual que en el resto de la app.
create unique index if not exists cheques_echeq_unico on public.cheques (id_echeq)
  where id_echeq is not null;


-- ═════════════════════════════════════════════════════════════════════════
-- 2. El curso del cheque
-- ═════════════════════════════════════════════════════════════════════════
-- `cheques.estado` dice dónde está hoy. Esta tabla dice cómo llegó, que es lo que
-- se pide cuando un cheque rebota y hay que reconstruir qué se hizo y cuándo.
create table if not exists public.cheques_eventos (
  id            uuid primary key default gen_random_uuid(),
  cheque_id     uuid not null references public.cheques(id) on delete cascade,
  fecha         date not null default current_date,
  estado        text not null,
  -- Si el evento movió plata —un rechazo que se le debita al cliente—, acá va el
  -- movimiento que lo registra. La plata NUNCA se guarda en esta tabla.
  movimiento_id uuid references public.movimientos_caja(id) on delete set null,
  notas         text,
  creado_en     timestamptz not null default now(),
  creado_por    uuid references auth.users(id),

  constraint cheques_eventos_estado_ok check (estado in
    ('en_cartera', 'depositado', 'acreditado', 'rechazado', 'endosado', 'devuelto'))
);

comment on table public.cheques_eventos is
  'Una fila por cambio de estado de un cheque. El alta escribe la primera '
  '(en_cartera). Si el evento movió plata, movimiento_id apunta a ese movimiento.';

create index if not exists cheques_eventos_cheque_idx on public.cheques_eventos (cheque_id, fecha);


-- ═════════════════════════════════════════════════════════════════════════
-- 3. Que cierre contra la caja
-- ═════════════════════════════════════════════════════════════════════════
-- La suma de los cheques de un movimiento tiene que dar la columna CHEQUES de ese
-- movimiento. Si no da, alguien cargó un cheque de más, de menos, o editó el importe
-- en un solo lado. Devuelve vacío cuando está todo bien.
create or replace function public.cheques_descuadrados()
returns table (
  movimiento_id uuid,
  fecha         date,
  en_la_caja    numeric,
  suma_cheques  numeric,
  diferencia    numeric
)
language sql
stable
as $$
  select m.id, m.fecha, abs(m.cheques), coalesce(sum(c.importe), 0),
         abs(m.cheques) - coalesce(sum(c.importe), 0)
  from public.movimientos_caja m
  join public.cheques c on c.movimiento_id = m.id
  group by m.id, m.fecha, m.cheques
  -- Medio centavo: los importes son numeric(18,2), así que cualquier diferencia real
  -- es de al menos un centavo. No es una tolerancia de negocio.
  having abs(abs(m.cheques) - coalesce(sum(c.importe), 0)) > 0.005;
$$;

comment on function public.cheques_descuadrados() is
  'Movimientos donde la suma de sus cheques no coincide con la columna CHEQUES. '
  'Vacío = todo cierra. Mismo criterio que validar-posicion: dos lugares que '
  'muestran lo mismo tienen que dar lo mismo.';


-- ═════════════════════════════════════════════════════════════════════════
-- 4. Permisos
-- ═════════════════════════════════════════════════════════════════════════
-- A diferencia de `movimientos_caja`, donde solo escribe el sync, estas filas nacen
-- en la app: el personal escribe de verdad. Los predicados de rol son los de
-- `docs/ROLES.md` — nunca comparar roles a mano.
alter table public.cheques         enable row level security;
alter table public.cheques_eventos enable row level security;

drop policy if exists "Staff ve cheques" on public.cheques;
create policy "Staff ve cheques"
  on public.cheques for select using (public.es_staff());

drop policy if exists "Staff carga cheques" on public.cheques;
create policy "Staff carga cheques"
  on public.cheques for insert with check (public.es_staff());

drop policy if exists "Staff edita cheques" on public.cheques;
create policy "Staff edita cheques"
  on public.cheques for update using (public.es_staff());

-- Borrar un cheque es excepcional: lo normal es cambiarle el estado a 'devuelto'.
drop policy if exists "Admin borra cheques" on public.cheques;
create policy "Admin borra cheques"
  on public.cheques for delete using (public.es_admin());

drop policy if exists "Staff ve eventos de cheques" on public.cheques_eventos;
create policy "Staff ve eventos de cheques"
  on public.cheques_eventos for select using (public.es_staff());

drop policy if exists "Staff carga eventos de cheques" on public.cheques_eventos;
create policy "Staff carga eventos de cheques"
  on public.cheques_eventos for insert with check (public.es_staff());

-- El historial no se edita ni se borra: es el registro de lo que pasó. Sin policies
-- de update ni de delete, nadie que pase por RLS puede tocarlo.


-- ═════════════════════════════════════════════════════════════════════════
-- Verificación
-- ═════════════════════════════════════════════════════════════════════════
-- Tiene que devolver las dos tablas, seis índices propios además de las claves
-- primarias, y seis policies.
--
-- select table_name, count(*) as policies
-- from information_schema.tables t
-- join pg_policies p on p.tablename = t.table_name
-- where t.table_name in ('cheques', 'cheques_eventos')
-- group by table_name;
--
-- Y esta tiene que dar cero filas siempre:
-- select * from public.cheques_descuadrados();
