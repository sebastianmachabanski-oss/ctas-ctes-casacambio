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

## Lo que NO es un error, aunque lo parezca

`diario.cc_*` guarda el valor **negado** respecto de la planilla y de
`movimientos_caja.cc_*`. Verificado sobre la fila 31226 del Sheet (28/5/2026, EDY, TT de
15.300 dólares): la planilla tiene `CC DOLARES = −15.300`, `movimientos_caja` guarda
−15.300 y `diario` guarda +15.300.

Es la óptica del cliente, la misma que usa el reporte de cuentas corrientes de la
planilla. Por eso los saldos en pesos de EDY coinciden exacto. **No invertir el signo**:
daría vuelta el saldo de las 44 cuentas.

## Lo que queda pendiente

En EDY sobran **13.000** en dólares y **13.000** en pesos, más allá del signo:

| | `diario` | opuesto de `movimientos_caja` | diferencia |
|---|---:|---:|---:|
| Dólares | 486.971 | 499.971 | 13.000 |
| Pesos | −37.411.562 | −37.424.562 | 13.000 |

La consulta que lista todas las cuentas con diferencia:

```sql
select coalesce(d.cuenta, m.cuenta) as cuenta,
       d.usd as diario_usd, m.usd as caja_usd,
       d.ars as diario_ars, m.ars as caja_ars
from (select cuenta_cte as cuenta, sum(cc_dolares) usd, sum(cc_pesos) ars
      from public.diario where tipo = 'CTA CTE' and anulado = false group by 1) d
full join (select cliente as cuenta, sum(cc_dolares) usd, sum(cc_pesos) ars
      from public.movimientos_caja where tipo = 'CTA CTE' group by 1) m
  on m.cuenta = d.cuenta
where d.usd is distinct from -m.usd or d.ars is distinct from -m.ars
order by 1;
```

Hipótesis a revisar con la planilla al lado, en ese orden:

1. Filas que una tabla incluye y la otra no. `parseMovimientos` (diario) exige que la
   columna CLIENTE diga exactamente `CTA CTE`; `parseMovimientosCaja` clasifica igual
   pero además importa las filas de CAJA. Una fila con el cliente mal escrito entra en
   una tabla y no en la otra.
2. Operaciones de TT y SWITCH, que tienen dos patas y se registran distinto en cada tabla.
3. Filas con `anulado = true`, que `diario` excluye y `movimientos_caja` no distingue.
