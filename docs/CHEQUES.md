# Cheques

Cómo la app trata los cheques como **instrumentos** y no como una moneda más.
Definido el 22/11/2026. La estructura está en `migrations/2026-11-22_cheques.sql`.

> **Estado al 23/11/2026: construido, menos el OCR.** Andan el alta de N cheques dentro
> de Nueva operación, la cartera, la ficha con el curso, los cambios de estado, la imagen
> del cheque y la siembra para la demostración. Lo único que falta de lo que se había
> planeado es la lectura automática: ver *El OCR*, al final.

---

## Por qué no alcanza con una moneda

Mil dólares son mil dólares. Un cheque es un **objeto específico**: librador, banco,
número, importe, fecha de pago, y un estado que cambia en el tiempo.

Hasta hoy un cheque es un importe en la columna `CHEQUES` de `movimientos_caja`. Eso
alcanza para el margen del descuento —la cartera se valúa a nominal y la ganancia se
reconoce al tomar el documento, criterio del 11/8/2026— pero no para contestar lo que
una casa que descuenta cheques necesita saber todos los días:

- **¿Qué vence esta semana?**
- **¿Qué está vencido y todavía no deposité?**
- **¿Cuánto tengo colgado del mismo librador?**

Ninguna de las tres se contesta con un importe en una columna, por más bien que se lea
la foto. **Por eso el OCR no es el principio del problema, es el final.**

## Para quién es

Para el producto y los clientes que **descuentan** cheques: compran el documento a
descuento y necesitan gestionar la cobranza y los rechazos.

El cliente actual solo toma **cheques al día** y, hasta donde sabemos, no los registra.
Para él el calendario queda vacío y esto no cambia nada — que es la prueba de que el
modelo tolera el caso simple sin un circuito aparte.

---

## La estructura

```
movimientos_caja ──1:N──> cheques ──1:N──> cheques_eventos
   (la plata)          (el instrumento)      (su curso)
```

**La plata no se duplica.** Los importes siguen viviendo en `movimientos_caja`. Las dos
tablas nuevas guardan el instrumento y su historia, nunca una segunda contabilidad.

`cheques_descuadrados()` existe para avisar si las dos se despegan: la suma de los
cheques de un movimiento tiene que dar su columna `CHEQUES`. Es la misma clase de regla
que valida `scripts/validar-posicion.mts` — dos lugares que muestran lo mismo tienen
que dar lo mismo. **Devuelve vacío cuando está todo bien.**

### Papel y echeq son el mismo instrumento

Lo que cambia es la **puerta de entrada**, no el objeto:

| | Papel | Echeq |
|---|---|---|
| Identificador | banda CMC7 | ID de COELSA |
| Cómo entran los datos | a mano, después OCR | archivo estructurado |
| Endoso | físico | electrónico y trazable |
| Calendario, estados, alertas, riesgo | **idénticos** | **idénticos** |

Separarlos en dos tablas duplicaría todo lo que está en la última fila. Una tabla,
columna `tipo`, dos caminos de ingreso.

---

## Flujo 1 · El alta: el cheque entra por la operación

**Un cheque nunca se carga suelto.** Aparece porque alguien hizo una transacción, y esa
transacción tiene su contrapartida en plata. Un inventario cargado aparte no cerraría
nunca contra la caja.

Y **una operación trae N cheques**: el cliente llega con cinco y se lleva un solo pago.

```
Nueva operación · COMPRA · CHEQUES
├─ Cliente, fecha
├─ Cheques
│    + Cheque 1   nº · banco · librador · CUIT · importe · fecha de pago
│    + Cheque 2   …
│    Total nominal                    $ 1.250.000   ← calculado, no se tipea
├─ Pesos entregados                   $ 1.180.000
└─ Margen del descuento               $    70.000   ← lo que ya calcula el motor
```

Al guardar:

1. Se escribe el movimiento en `movimientos_caja` como hoy, con el **total** en
   `CHEQUES` — el motor de cálculo no se toca.
2. Se escribe **una fila en `cheques`** por cada cheque, con `movimiento_id` apuntando
   al movimiento.
3. Se escribe **una fila en `cheques_eventos`** por cada uno, con estado `en_cartera`.
4. Si la operación es de cuenta corriente, además va a `diario` como cualquier otra:
   la regla de las dos tablas que van a la par no cambia.

**Validación al guardar:** la suma de los cheques tiene que dar el total. Si no da, no
se guarda.

**Duplicados.** Si entra un cheque papel con el mismo número y banco que uno que ya está
en cartera, la pantalla **avisa y deja seguir**: el mismo número se repite entre bancos y
un cheque rechazado puede volver a entrar legítimamente. Un echeq con un ID ya cargado,
en cambio, se rechaza: ese identificador es único de verdad.

**El caso simple.** Recibir un cheque al día como pago, sin descuento, usa el mismo
circuito: el cheque cuelga del movimiento que sea. No hace falta un flujo aparte.

### Los tres números del alta, y quién pone cada uno

| | Quién lo pone |
|---|---|
| **Nominal** | La suma de los cheques de la lista. No se tipea. |
| **Cotización** | El operador. Es obligatoria. |
| **Pesos que salen** | El motor: nominal × cotización. No se tipea. |

La cotización es **pesos por peso de nominal**: 0,88 quiere decir que se pagan 88 por
cada 100 de cheque. Es lo que la app guarda y lo que el motor usa.

### La tasa, segunda entrada de la cotización

Agregada el 27/11/2026. **Nadie negocia en cotización.** El cliente dice *"te lo tomo al
tres y medio mensual"* y el operador tiene que convertir de cabeza, con el plazo en el
medio. Esa cuenta es donde se pierde plata.

Entonces en una COMPRA de CHEQUES aparece una casilla **Tasa mensual** al lado de
Cotización, y las dos están atadas: se escribe una y se completa la otra.

```
Cotización      0,9125        Tasa mensual     3,50
75 días de plazo promedio     Directa sobre el nominal
```

Cuatro decisiones, todas en `src/lib/cheques-tasa.ts`:

- **La tasa es DIRECTA y MENSUAL.** Directa es sobre el nominal, que es como se habla en
  el mostrador; la efectiva —sobre la plata puesta— se muestra en la ficha del cheque
  pero no se tipea. Mensual porque nadie cotiza "tasa del período".
- **Escala lineal, no capitaliza.** 3,5 % a 60 días es 7 %, no 7,12 %. Es la convención
  de la calle.
- **El plazo sale de los cheques**, promedio ponderado por importe. Por eso la casilla
  está apagada hasta que haya cheques cargados, y lo dice.
- **Lo que se guarda sigue siendo la cotización.** La tasa no se persiste: es una ayuda
  de carga, no un dato nuevo. Nada cambia en la base ni en el motor.

Si se agrega un cheque después de tipear la tasa, el plazo cambia y **la cotización se
recalcula sola** para respetar la tasa pactada. Al revés sería peor que no tener el
campo: la pantalla mostraría una tasa que no es la de la cotización que se va a guardar.

La aritmética la cubre `scripts/validar-tasa-cheques.mts`, incluida la ida y vuelta entre
las dos casillas.

## Flujo 2 · La cartera: lo que se mira todos los días

Pantalla nueva, **Cartera de cheques**. Es el producto de todo esto; lo demás es
alimentarla.

```
Vencen hoy            3 cheques     $   420.000
Vencen esta semana   11 cheques     $ 2.180.000
Vencidos sin depositar  2 cheques   $   310.000   ← en rojo
Rechazados en gestión   1 cheque    $    85.000   ← en rojo
────────────────────────────────────────────────
Total en cartera     47 cheques     $ 9.640.000
```

Debajo, la lista ordenada por `fecha_pago`, filtrable por estado, con el librador y los
días que faltan. Y una vista de **concentración por librador**: diez cheques del mismo
librador son **un** riesgo, no diez. Esa es la pregunta que no se puede contestar hoy
ni en la planilla.

## Flujo 3 · Depósito

Se eligen uno o varios cheques en cartera y se marcan como depositados, con la fecha.

- `cheques.estado` → `depositado`
- una fila en `cheques_eventos`

**No mueve plata.** El cheque ya se pagó cuando se descontó; depositarlo es un trámite.

## Flujo 4 · Acreditación

El banco pagó. `estado` → `acreditado`, su fila de evento, el cheque sale del calendario
**y se registra el movimiento de plata**.

> **Esto cambió el 27/11/2026.** Antes la acreditación no movía nada: se suponía cargada
> aparte, a mano, como cualquier otro ingreso. Nadie lo enlazaba ni avisaba si no se
> hacía, y la consecuencia era visible — la tarjeta CHEQUES de Inicio nunca se vaciaba.
> No era la cartera: era el acumulado histórico de compras, cobrados incluidos.

### El movimiento que genera

| Campo | Valor |
|---|---|
| Operación | VENTA |
| Moneda propia | CHEQUES |
| Moneda externa | PESOS |
| Monto | El nominal de los cheques acreditados |
| Cotización | **1** — el banco paga el valor escrito, no hay quita |
| Cliente | **El banco del cheque**, o `COBRO DE CHEQUES` si no está cargado |
| Resultado | `cheques = −nominal` · `pesos = +nominal` |

**El cliente es el banco, no quien trajo el cheque.** Poner al cliente original le
duplicaría el volumen operado —te vendió el cheque y después te lo "compró"— y ensuciaría
cualquier reporte por cliente.

### Por qué no cambia Ganancias

Un cheque de 100 comprado en 88:

| | Antes | Ahora |
|---|---|---|
| Calce | 0 | 100 × (1,00 − 0,88) = 12 |
| Valuación del stock a nominal | 12 | 0 |
| **Ganancia** | **12** | **12** |

Valuar la cartera a nominal **es** anticipar este cobro. Registrarlo no agrega ganancia:
le saca el supuesto.

### Las reglas que respeta

- **`diario` Y `movimientos_caja`**, con el mismo `vinculo`. Regla del dominio del
  1/9/2026.
- **`origen = 'app'`**, y no se escribe a la planilla. Esta fila no existe allá: la genera
  la app al marcar el cheque. Un sync la borraría igual que borraría las de USDT, y si la
  oficina además carga el cobro en la planilla, se duplicaría.
- **La fecha es la del hecho**, no la del día en que se marca. El diálogo la pide. Un
  cobro cargado tres días tarde tiene que entrar con la fecha en que el banco pagó, o el
  arqueo de ese día no cierra.
- **La plata primero, el estado después.** Si fallara al revés, el cheque quedaría
  acreditado sin su plata y nadie lo notaría hasta el arqueo.
- **Un movimiento por banco.** Acreditar de una tanda cheques de bancos distintos son
  cobros distintos; mezclarlos obligaría a inventar un cliente que no es ninguno.

### Cobro por ventanilla

No todo cheque pasa por el banco. Si se cobra en la ventanilla el día de pago, va de
`en_cartera` directo a `acreditado`, **sin depositarse**.

> Antes la máquina asumía que todo cheque se depositaba, y para registrar un cobro de
> ventanilla había que marcarlo `depositado` primero: un hecho que no ocurrió, anotado en
> un historial que después nadie puede desmentir.

Es el **mismo estado** que la acreditación bancaria y el mismo movimiento de plata. La
diferencia —si pasó o no por el banco— ya la dice el evento anterior; dos estados para el
mismo hecho duplicarían las reglas sin agregar información.

### Deshacer

`acreditado` **dejó de ser terminal** y deshacer **borra el movimiento** de las dos tablas.
Antes un clic equivocado solo ponía mal un estado; ahora mete dinero en la caja, y una
operación que mueve plata sin forma de deshacerse se arregla tocando la base.

**Vuelve de donde vino**, no siempre al mismo lugar: a `depositado` si se cobró por banco,
a `en_cartera` si fue por ventanilla. Lo resuelve `estadoAnterior()` leyendo el historial.
Mandarlo siempre a `depositado` inventaría un depósito que nunca ocurrió — el mismo error
que el cobro de ventanilla obligaba a cometer.

Por eso la ficha ofrece **un solo botón** aunque la máquina admita dos destinos: no es una
elección del operador, y pedirle que recuerde cómo se cobró ese cheque sería pedirle que
haga el trabajo del historial.

El movimiento se ubica por `cheques_eventos.movimiento_id` — la columna que la tabla tenía
declarada y vacía desde el 22/11/2026, porque hasta ahora solo la escribía el alta. Si un
cheque se acreditó antes de esa fecha no hay movimiento que borrar, y la pantalla lo dice
en vez de quedarse callada.

### Dónde se hace

Desde la ficha de a uno, o **desde la cartera en tanda**: se eligen los depositados y se
acreditan juntos. Es el caso normal —el banco paga veinte el mismo día— y antes obligaba a
entrar cheque por cheque.

La selección no puede mezclar estados: con unos en cartera y otros depositados ninguna de
las dos acciones vale para todos, y la pantalla lo explica en vez de dejar un botón
apagado sin motivo.

## Flujo 5 · Rechazo — el único que cuesta

Es el evento que justifica todo lo anterior. La casa ya pagó por un documento que no se
cobró.

```
estado → rechazado
└─ ¿qué se hace con la plata?
   ├─ se le debita al cliente en su cuenta corriente   → movimiento
   ├─ el cliente lo repone en efectivo                 → movimiento
   └─ se asume la pérdida                              → movimiento
```

### Las salidas, una por una (27/11/2026)

Cheque de **100.000** comprado en **88.000** (cotización 0,88).

**Marcar `rechazado` no mueve plata.** El cheque todavía puede reintentarse: no pasó nada
definitivo. La plata se mueve al **resolver** el rechazo, que es un segundo momento.

| Salida | Estado | Movimientos |
|---|---|---|
| Reintentar el depósito | `depositado` | ninguno |
| Repone en efectivo | `devuelto` | VENTA · CHEQUES → PESOS · 100.000 · cot 1 |
| Se lo debito en cuenta | `devuelto` | esa VENTA **+** CTA CTE · EGRESAN · PESOS · 100.000 |
| Canje por otro cheque | `devuelto` | esa VENTA **+** COMPRA del cheque nuevo |
| Nadie lo levanta | `incobrable` | esa VENTA **+** GASTOS · PESOS · 100.000 |

**Se le cobra el NOMINAL, no lo adelantado.** El cliente endosó un documento de 100.000 y
garantizó que se pagaba: debe 100.000. Devolver solo los 88.000 dejaría a la casa
trabajando gratis, habiendo puesto la plata y corrido el riesgo. El campo queda editable
para negociar caso por caso.

**La cuenta corriente necesita dos filas, no una.** El motor no tiene columna
`CC CHEQUES` y corta con un error explícito, así que el cheque sale contra caja y la
cuenta del cliente se debita por separado. Neto: el cheque sale, la caja de pesos no se
mueve, el cliente queda debiendo.

### Cómo se resuelve en pantalla

Desde la ficha de un cheque rechazado, el botón **Resolver el rechazo** abre un panel con
las tres salidas con plata, la fecha y el importe recuperado. Las otras dos —reintentar y
dar por incobrable— siguen siendo botones de la máquina de estados, porque no hay nada que
preguntar.

El panel es una pantalla y no un botón más porque **cuánto se recupera y de dónde viene
son decisiones del momento**: no están en ningún dato previo.

- El importe **arranca en el nominal** y es editable. No puede superarlo: si hay
  intereses, van como una operación aparte.
- En el canje se muestra, mientras se carga, cuánto vale de más el cheque nuevo. Esa
  diferencia es la ganancia del canje, y sale sola del spread entre las dos cotizaciones.
- El cheque nuevo queda con el vínculo al que rebotó en sus notas.

Las tres terminan en `devuelto` y **la plata se escribe antes que el estado**, igual que en
la acreditación: si fallara al revés, el cheque quedaría resuelto sin su plata y nadie lo
notaría hasta el arqueo. Si falla cualquier paso se deshace todo lo anterior.

El endpoint es `/api/cheques/resolver-rechazo`, aparte de `/api/cheques/estado` porque
este último solo cambia estados.

### El incobrable

Estado propio, no `devuelto`: ahí el cliente resolvió y se llevó el papel; acá la casa se
quedó con un documento que no vale. Mezclarlos haría que la pérdida por incobrables deje
de poder consultarse.

**Son dos movimientos, y el porqué importa.** Lo natural sería una venta a cotización
cero, pero el motor convierte el cero en uno y registraría un cobro que nunca pasó. Y un
`FALTANTE` deja la caja bien pero **Ganancias peor**: esa operación no entra al cálculo,
así que el cheque seguiría contando como stock valuado a nominal y mostraría ganancia por
algo que nunca se cobró.

| | Caja | Ganancias |
|---|---|---|
| Compra | −88.000 | — |
| Salida del cheque a nominal | +100.000 | +12.000 (calce) |
| Gasto | −100.000 | −100.000 |
| **Neto** | **−88.000** | **−88.000** |

**El gasto es por el nominal y no por lo pagado** porque los 12.000 de descuento ya se
habían reconocido al comprar. Dar de baja el documento entero borra la ganancia que no
existió y el capital que sí se puso. Si el gasto fuera 88.000, la pérdida informada sería
76.000.

El gasto lleva el concepto fijo `CHEQUE INCOBRABLE` en el campo CLIENTE, que es por donde
la pantalla de Gastos busca: así la pérdida por cheques se consulta aparte del alquiler y
los sueldos.

**Se puede deshacer:** vuelve a `rechazado` y se borran las dos filas. El gasto se ubica
por la referencia, que lleva el id del cheque para que la coincidencia sea única.

---

En los tres casos hay un movimiento, y **su id va guardado en el evento**
(`cheques_eventos.movimiento_id`). Para eso existe esa columna: para poder
reconstruir, meses después, qué se hizo con cada rechazo y cuánto costó.

> **Esto todavía no está conectado a la pantalla (23/11/2026).** El botón de rechazo
> cambia el estado y deja el evento, pero no ofrece las tres salidas ni arma el
> movimiento: hoy hay que cargarlo por separado en Nueva operación, y el enlace entre el
> evento y ese movimiento queda sin hacer. Es la entrada **6.6** del roadmap.

Desde `rechazado` el cheque puede ir a `devuelto` (se le devolvió el papel al cliente) o
quedarse en gestión de cobro.

## Flujo 6 · Endoso

El cheque se entrega a un tercero como pago. `estado` → `endosado`, sale de la cartera,
y el movimiento que lo usa como medio de pago queda referenciado en el evento.

---

## La máquina de estados

| Desde | Puede ir a |
|---|---|
| `en_cartera` | `depositado` · `acreditado` (ventanilla) · `endosado` · `devuelto` |
| `depositado` | `acreditado` · `rechazado` |
| `rechazado` | `devuelto` · vuelve a `depositado` (se reintenta) |
| `acreditado` | vuelve a `depositado` o a `en_cartera`, según de dónde vino — deshace el cobro y borra su movimiento |
| `endosado` | — (terminal) |
| `devuelto` | — (terminal) |

`cheques.estado` guarda **dónde está hoy**, para consultar rápido. `cheques_eventos`
guarda **cómo llegó**. Los dos se escriben juntos, siempre.

El historial **no se edita ni se borra**: la migración no le pone policies de `update`
ni de `delete`, así que nadie que pase por RLS puede tocarlo.

## Alertas

Las cuatro que se ganan el lugar:

1. **Vence en N días** — para que se deposite a tiempo.
2. **Vencido y sin depositar** — plata parada por olvido.
3. **Rechazado** — arranca la gestión de cobro.
4. **Concentración por librador** por encima de un umbral — el riesgo real.

## La foto

Se guarda en `cheques.archivo_url`, pero vale saber qué hace y qué no.

**No es el instrumento.** El instrumento es el papel, y una vez depositado lo tiene el
banco. La foto sirve en dos momentos, los dos breves: para verificar un dato tipeado
antes de depositar, y para la gestión de cobro si el cheque rebota.

**Lo que sí la justifica a largo plazo es que es el insumo del OCR.** Sin imagen
guardada no hay forma de reprocesar ni de mejorar la lectura.

**Y contiene datos sensibles de terceros**: CUIT, número de cuenta y firma del librador,
que no son del cliente de la casa de cambio sino de quien libró el cheque. Antes de que
haya volumen hay que definir **cuánto tiempo se conservan**. No se resuelve en la v1
porque con cero cheques no hay nada que conservar, pero se decide antes de que sea un
archivo de miles de imágenes y no antes de que alguien lo pregunte.

---

## Lo que queda afuera de la primera versión

| | Por qué |
|---|---|
| **OCR** | Parado por decisión del 23/11/2026. Ver *El OCR*, abajo. |
| **Lectura de archivos de echeq** | El modelo ya lo contempla (`tipo`, `id_echeq`); el parser es trabajo aparte y depende de si los clientes los usan. |
| **Retención de imágenes** | Ver arriba. |
| **Convivencia con el sync** | Estas filas nacen en la app y el Sheet no las tiene, igual que USDT. Si alguna vez se activa en una instancia con sync, hay que decidir qué pasa cuando el sync reescribe el movimiento al que un cheque está atado. Hoy ese caso no existe. |

---

## El OCR

**Parado a propósito el 23/11/2026**, no por falta de tiempo. Tiene adentro una decisión
que no es técnica y la toma el cliente.

### Por qué no es una decisión de implementación

La foto de un cheque muestra **CUIT, número de cuenta y la firma del librador**. El
librador no es el cliente de la casa de cambio: es un tercero que nunca aceptó nada.
Mandar esa imagen a un proveedor externo para que la lea es una decisión del negocio.

Es la misma razón por la que el bucket es privado y la imagen se sirve con un enlace
firmado y de vida corta. Habiendo cuidado eso, no tendría sentido que la primera cosa que
hace la app con la imagen sea mandarla afuera sin que nadie lo haya decidido.

### Las tres opciones, con lo que cada una cuesta de verdad

| | Qué lee | Qué pide | Dónde va la imagen |
|---|---|---|---|
| **Claude (visión)** | Es el único que lee bien una foto de teléfono, torcida y con partes manuscritas | Clave de API y habilitar el host en Netlify. Costo bajo por imagen | A Anthropic |
| **Google Vision / AWS Textract** | Muy bueno con texto impreso, flojo con manuscritos — y el importe y la fecha suelen ir a mano, que es justo lo que importa | Cuenta en el proveedor, clave y habilitar el host | A Google o Amazon |
| **En el navegador (tesseract.js)** | Sobre una foto de cheque real, poco | Nada: no sale del dispositivo. Descarga unos 15 MB la primera vez | A ningún lado |

Esfuerzo, en cualquiera de las tres: **10 a 14 h**, de las cuales unas 5 o 6 son la
pantalla de confirmación, que es común y hay que hacer igual.

### La regla que no cambia según el motor

**El OCR precarga; la persona confirma.** Nunca se registra solo.

No es prudencia genérica: un importe mal leído **no se descubre hasta el día del
rechazo**, cuando ya se pagó por el cheque. Y hay algo peor que un formulario vacío, que
es un formulario mayormente lleno y equivocado: la gente acepta lo que ya está puesto.
Por eso, el día que se haga, la pantalla tiene que mostrar lo leído como **sugerencia por
campo** y no como valor cargado.

### Lo que ya hace que el OCR valga menos de lo que parece

En el alta, al agregar una fila **se heredan librador, CUIT y banco de la anterior**. Una
tanda suele venir de uno o dos libradores, así que de los siete campos de un cheque, tres
ya vienen puestos. Lo que el OCR ahorraría de verdad es el número y el importe.

Conviene tenerlo presente al evaluar el costo: no se está comparando contra cargar todo a
mano, sino contra cargar dos campos.
