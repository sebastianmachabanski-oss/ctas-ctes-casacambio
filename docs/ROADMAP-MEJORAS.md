# Roadmap de mejoras — módulos ofrecibles por separado

Listado de mejoras posteriores al alcance original (digitalizar, modernizar y securizar
la operatoria del Excel, cerrado al 29/7/2026). Cada ítem está pensado como **módulo
autónomo, cotizable y vendible por separado**, con foco en valor de negocio, no en deuda
técnica.

**Convención de esfuerzo:** horas-desarrollador de presupuesto, misma base que
`docs/PLAN-VS-REAL.md` (el tiempo activo real históricamente fue muy inferior).

---

## Punto de partida: qué NO tiene la app hoy

Relevado sobre el código al 29/7/2026, para no vender lo ya construido:

- **Sin exportación**: ninguna pantalla permite bajar a Excel/CSV/PDF.
- **Sin trazabilidad de quién hizo qué**: `movimientos_caja` no guarda usuario que carga,
  edita o borra (solo `synced_at`). La tabla vieja `diario` sí tenía `creado_por`.
- **Sin comprobante de operación**: no hay ticket ni constancia para el cliente final.
- **Portal del cliente mínimo**: el rol `cliente` existe y ve su cuenta corriente y
  cambia su contraseña. Nada más.
- **Sin arqueo/cierre de caja**: la app muestra el saldo teórico, nunca se contrasta
  contra el efectivo contado.
- **Clientes sin normalizar**: `cliente` es texto libre (decisión de negocio vigente),
  lo que impide analítica por cliente.
- **Cotización sin pizarra propia**: hay banda de mercado de referencia, pero el
  operador tipea la cotización a mano en cada operación.

---

## 1. Control interno y confianza (el eje "securizar" llevado al día a día)

### 1.1. Auditoría y trazabilidad completa — **6 a 8 h**
Registrar quién carga, edita y borra cada operación, cuándo, y **qué cambió**
(valor anterior → valor nuevo). Pantalla de auditoría filtrable por usuario, fecha y
operación.

> **Gancho comercial:** hoy, si un número aparece cambiado, no hay forma de saber quién
> lo tocó. Con varios operadores sobre la misma caja, esto es control interno básico y
> es lo primero que pregunta cualquier contador o auditor.

### 1.2. Cierre de caja diario / arqueo — **8 a 10 h**
Al cerrar el día, el operador declara el efectivo **físico contado** por moneda; el
sistema lo compara contra el saldo teórico (que ya calcula) y registra la diferencia,
con historial de cierres y quién los firmó.

> **Gancho comercial:** convierte la app de "registro" en **control**. Un faltante se
> detecta el mismo día y con responsable identificado, en vez de aparecer a fin de mes
> sin poder reconstruir qué pasó. Probablemente el módulo de mayor impacto real.

### 1.3. Alertas de posición y stock mínimo — **4 a 6 h**
Avisar cuando el stock de una moneda baja de un mínimo configurable (ej. quedan menos de
USD 10.000) o cuando hay exceso ocioso sin colocar.

> **Gancho comercial:** evita quedarse sin billete para una operación grande y evita
> capital dormido. Se apoya en el umbral configurable que ya existe.

### 1.4. Backup automático a Drive + restauración probada — **3 a 4 h**
Automatizar el `pg_dump` que hoy es manual, subirlo a una carpeta de Drive del negocio
con la cuenta de servicio existente, y dejar una restauración de prueba documentada.

> **Gancho comercial:** se vende como *plan de continuidad*. Barato de hacer, muy
> tranquilizador para el dueño.

---

## 2. Cara al cliente final (lo que el cliente de la casa de cambio percibe)

### 2.1. Comprobante de operación — **5 a 7 h**
Generar una constancia (PDF/imagen) con el detalle de la operación —fecha, monedas,
monto, cotización aplicada, saldo resultante— lista para enviar por WhatsApp o imprimir.

> **Gancho comercial:** el salto de imagen más grande por menos plata. Pasa de "te lo
> anoto" a entregar un comprobante profesional con la marca del negocio.

### 2.2. Extracto de cuenta corriente enviable — **6 a 8 h**
Extracto en PDF por cuenta y período, con saldo de apertura, movimientos y cierre.
Descargable y enviable por email; opcionalmente automático a fin de mes.

> **Gancho comercial:** elimina el ida y vuelta telefónico de "pasame cómo estoy".
> Además, un extracto formal reduce discusiones sobre saldos.

### 2.3. Portal del cliente ampliado — **10 a 14 h**
Extender el acceso `cliente` actual: descarga de extractos, cotizaciones del día,
**confirmación de saldo** (el cliente valida su saldo y queda registrado) y
solicitud de operación ("quiero comprar USD 5.000") que le llega al operador.

> **Gancho comercial:** diferencial competitivo fuerte. Muy pocas casas de cambio de
> este porte le dan acceso digital al cliente; fideliza y descarga trabajo del mostrador.

### 2.4. Pizarra de cotizaciones propia — **6 a 8 h**
El negocio define su compra/venta del día por moneda (con spread sobre la referencia de
mercado). La app la usa como **valor por defecto** al cargar operaciones y permite
publicarla o enviarla a clientes.

> **Gancho comercial:** doble beneficio — comercial (comunicar precios) y de control
> (menos errores de tipeo en la cotización; recordar los EUR/USD cargados como 1 que
> hubo que corregir a mano en la reconciliación).

---

## 3. Dinero en la calle y logística

### 3.1. Circuito completo de entregas — **10 a 12 h**
Extender "Dinero en calle" (hoy vista + marcar ingreso) a un circuito con estados:
pendiente → en camino → entregado/rechazado, con sello de tiempo, quién confirmó y
comprobante de entrega.

> **Gancho comercial:** es **plata real en la calle**. Saber en tiempo real cuánto tiene
> cada repartidor y desde cuándo reduce pérdidas y discusiones.

### 3.2. Vista móvil del repartidor — **6 a 8 h**
Acceso restringido en el celular: el repartidor ve solo sus entregas y marca la entrega
en el momento (con hora y, opcionalmente, ubicación).

> **Gancho comercial:** cierra el circuito anterior sin llamadas telefónicas. Se vende
> junto con 3.1 como paquete "logística de efectivo".

---

## 4. Inteligencia de negocio (decisiones, no registro)

### 4.1. Rentabilidad por cliente y por moneda — **6 a 8 h**
Hoy Ganancias es un total global. Este módulo abre el margen por cliente, por moneda y
por tipo de operación, con ranking de los que más y menos aportan.

> **Gancho comercial:** responde la pregunta que ningún Excel contestaba: *¿qué clientes
> me dejan plata y cuáles me dan trabajo gratis?* Base para negociar spreads.

### 4.2. Análisis de spread por operación y operador — **6 a 8 h**
Comparar la cotización aplicada contra la de mercado en ese momento, y detectar
operaciones cerradas fuera de rango, por operador.

> **Gancho comercial:** detecta plata que se escapa por precios mal cargados o
> concesiones no autorizadas. Se paga solo con una operación grande detectada.

### 4.3. Estacionalidad y proyección de demanda — **5 a 7 h**
Qué días, semanas y horarios concentran demanda por moneda, para dotar la caja de
efectivo y organizar personal.

> **Gancho comercial:** menos capital inmovilizado y menos operaciones perdidas por no
> tener billete.

### 4.4. Paquete mensual para el contador — **4 a 6 h**
Exportación armada del período: libro de movimientos, resumen por moneda, cierre y
ganancias, en el formato que el contador ya usa.

> **Gancho comercial:** ahorra horas de armado manual todos los meses. Valor fácilmente
> cuantificable frente al costo del módulo.

---

## 5. Calidad de datos y cumplimiento

### 5.1. Ficha de cliente unificada + deduplicación — **8 a 12 h**
Detectar y unificar variantes del mismo cliente ("JUAN PEREZ" / "Juan Perez" / "J
PEREZ"), con ficha única: contacto, histórico, volumen operado y límite asignado.
Respeta la decisión vigente de texto libre: se propone, no se impone.

> **Gancho comercial:** es el **habilitador** de 4.1 y 5.2 — sin clientes normalizados
> no hay analítica por cliente posible. Conviene venderlo como paso previo.

### 5.2. Reportes de trazabilidad por cliente — **8 a 12 h**
Acumulados por cliente y período, detección de operaciones fraccionadas y umbrales
configurables, con reporte exportable.

> **Gancho comercial:** según el encuadre regulatorio del negocio, puede ser un
> requisito o una buena práctica. En cualquier caso, tener el dato ordenado ante un
> pedido de información es muy superior a reconstruirlo del Excel.

---

## 6. Productividad diaria (quick wins)

### 6.1. Exportación a Excel/PDF en todas las vistas — **4 a 6 h**
Botón "Exportar" en Transacciones, Cuentas Corrientes, Calle, Deudores y Ganancias,
respetando los filtros aplicados.

> **Gancho comercial:** **el primero que hay que vender.** El cliente viene de Excel y
> es lo que más va a extrañar. Bajo esfuerzo, valor percibido altísimo, y desactiva la
> objeción "con la planilla podía hacer cualquier cosa con los datos".

### 6.2. Búsqueda global — **3 a 4 h**
Buscar cliente, monto, nota o número de operación desde cualquier pantalla.

### 6.3. Plantillas de operaciones frecuentes — **3 a 5 h**
Cargar de un clic las operaciones repetitivas de cada día.

### 6.4. App móvil instalable (PWA) — **5 a 8 h**
Instalable en el celular con ícono propio, para consultar saldos y cargar fuera del
mostrador.

> **Gancho comercial:** percepción de "app de verdad" por muy poco desarrollo, ya que
> la base web actual es aprovechable.

---

## Secuencia de venta recomendada

| Orden | Módulos | Esfuerzo | Por qué en este orden |
|---|---|---|---|
| **1º** | 6.1 Exportación + 2.1 Comprobante | 9 a 13 h | Impacto visible inmediato y bajo costo; genera confianza para seguir comprando. |
| **2º** | 1.1 Auditoría + 1.2 Cierre de caja | 14 a 18 h | El salto real de control; es lo que justifica haber dejado el Excel. |
| **3º** | 3.1 + 3.2 Logística de efectivo | 16 a 20 h | Protege plata en la calle; ROI argumentable con un solo incidente evitado. |
| **4º** | 5.1 Ficha unificada → 4.1 Rentabilidad | 14 a 20 h | Ordenar clientes primero, después explotar la analítica. |
| **5º** | 2.3 Portal del cliente + 2.4 Pizarra | 16 a 22 h | Diferencial competitivo, una vez que el interno está sólido. |

**Paquete "arranque" sugerido:** 6.1 + 2.1 + 1.1 + 1.4 ≈ **18 a 25 h** — cubre
exportación, comprobante, auditoría y backup automático. Es la oferta más fácil de
cerrar porque cada ítem se explica en una frase.
