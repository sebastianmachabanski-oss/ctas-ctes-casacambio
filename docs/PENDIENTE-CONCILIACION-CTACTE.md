# Pendiente: conciliar Cuentas Corrientes contra la planilla

Anotado el 13/8/2026, al final de una jornada larga de correcciones. La app funciona;
esto es una diferencia de importe en un saldo, no una pérdida de datos.

## Lo que YA está resuelto

- **`diario` estaba vacía.** El sync full borra las filas de cuenta corriente y las
  reinserta; una fecha inválida (`2024-29-11`) hacía fallar el lote entero, así que
  borraba 16.500 filas y no insertaba ninguna. Corregido, más una validación para que
  una fila mala no vuelva a tumbar la carga completa.
- **Las fechas venían con el día y el mes cambiados.** `diario` se armaba con la lectura
  FORMATEADA de la planilla, donde `01/09/2026` es ambiguo. La planilla las muestra como
  mes/día y el parser asumía día/mes. Ahora todo se lee SIN formato, donde la fecha llega
  como número de serie. Verificado: cero filas con fecha futura.
- **La pantalla traía solo 1.000 movimientos.** PostgREST corta ahí si no se pagina, así
  que en las cuentas grandes la lista salía incompleta y el saldo acumulado no cerraba.
  Corregido con paginación.

## Resuelto: `diario` leía las columnas equivocadas

**Corrección de lo que decía antes esta sección.** El 13/8 anoté que el signo invertido de
`diario.cc_*` era una convención deliberada y que no había que tocarlo. Era falso: es el
mismo error de parser, y por poco hace que se diera por buena una tabla mal cargada.

`parseMovimientos` buscaba las columnas por nombre exacto `PESOS` / `DOLARES` / `EUROS` /
`REALES`, que son las de **CAJA**. Las de cuenta corriente se llaman `CC PESOS`,
`CC DOLARES`, etc.

Cómo llena la planilla las dos familias, verificado sobre filas reales:

| fila | propio → externo | columna de caja | columna de cta cte |
|---|---|---:|---:|
| 12488 | PESOS → PESOS | `pesos` −1.210.000 | `cc_pesos` **+1.210.000** |
| 12517 | DOLARES → DOLARES | `dolares` +800 | `cc_dolares` **−800** |
| 12514 | DOLARES → **PESOS** | `dolares` −13.000 | `cc_pesos` **+13.000** |

El impacto en la cuenta corriente va en la moneda de la columna **EXTERNO**, con el signo
opuesto al de caja. Dos consecuencias del error:

- **Todos los signos salían invertidos**, porque leer la columna de caja equivale a leer
  la de cuenta corriente cambiada de signo. Por eso parecía una convención.
- **Con las dos patas en monedas distintas, el importe caía en la moneda equivocada.**
  Ese es el caso de la fila 12514 y el origen de los 13.000 de EDY.

## Cómo se descubrió, y un error de método

La primera comparación fue contra un número leído a ojo del Sheet: daba 15.300 de
diferencia, apareció una fila de 15.300 y se la dio por culpable. Era una coincidencia de
importe, no la causa.

Lo que sirvió fue comparar `diario` contra `movimientos_caja` —la réplica validada contra
la planilla— fila por fila, agrupando por fecha hasta aislar el día, y de ahí la fila.
Esa consulta es la de más abajo y conviene volver a usarla ante cualquier duda de saldos.

## Verificación pendiente después del arreglo

Al leer las columnas correctas, **el signo de todos los saldos se da vuelta** respecto de
lo que la pantalla mostraba antes, y la magnitud de EDY pasa de 37.411.562 a 37.424.562.
Hay que confirmar contra la planilla cuál es el saldo que el negocio espera ver, porque
Hipótesis a revisar con la planilla al lado, en ese orden:

1. Filas que una tabla incluye y la otra no. `parseMovimientos` (diario) exige que la
   columna CLIENTE diga exactamente `CTA CTE`; `parseMovimientosCaja` clasifica igual
   pero además importa las filas de CAJA. Una fila con el cliente mal escrito entra en
   una tabla y no en la otra.
2. Operaciones de TT y SWITCH, que tienen dos patas y se registran distinto en cada tabla.
3. Filas con `anulado = true`, que `diario` excluye y `movimientos_caja` no distingue.
