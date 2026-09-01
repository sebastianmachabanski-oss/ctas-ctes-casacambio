-- Corregir el signo de las patas de cuenta corriente cargadas desde la app (1/9/2026).
--
-- QUE PASO
-- La ruta de alta calculaba a mano las columnas cc_* de `diario`, con el signo al reves
-- de la planilla: un INGRESAN quedaba positivo cuando corresponde negativo, y un EGRESAN
-- al reves. En Cuentas Corrientes esos movimientos restaban donde los de la planilla
-- sumaban, y el saldo de la cuenta no cerraba.
--
-- El codigo ya esta corregido (las patas ahora las da el motor). Esto arregla las filas
-- que quedaron mal guardadas.
--
-- POR QUE ALCANZA CON INVERTIR EL SIGNO
-- Se reviso una por una: en todas, la moneda de la pata coincide con la del movimiento.
-- No hay ninguna con las dos patas en monedas distintas, que es el otro caso que tenia
-- el mismo error y que NO se arregla invirtiendo (ahi el importe cae en la columna
-- equivocada y sin convertir). Si alguna vez aparece una, hay que rehacerla a mano.
--
-- ES SEGURO CORRERLA DOS VECES
-- Despues de invertir, las filas dejan de cumplir la condicion del WHERE: un INGRESAN
-- pasa a tener cc negativo y ya no entra. Una segunda corrida no toca nada.
--
-- Los comentarios van sin acentos a proposito: el SQL Editor de Supabase rompe la linea
-- al pegar acentos y guiones largos.

-- Antes de tocar nada, dejar a la vista que se va a corregir.
select cuenta_cte, fecha, operacion, moneda, monto,
       cc_pesos, cc_dolares, cc_euros, cc_reales, cc_usdt, creado_por
from public.diario
where tipo = 'CTA CTE'
  and anulado = false
  and (
    (operacion = 'INGRESAN' and (cc_pesos > 0 or cc_dolares > 0 or cc_euros > 0 or cc_reales > 0 or coalesce(cc_usdt, 0) > 0))
    or
    (operacion = 'EGRESAN'  and (cc_pesos < 0 or cc_dolares < 0 or cc_euros < 0 or cc_reales < 0 or coalesce(cc_usdt, 0) < 0))
  )
order by cuenta_cte, fecha;

-- La correccion.
update public.diario
set cc_pesos   = -cc_pesos,
    cc_dolares = -cc_dolares,
    cc_euros   = -cc_euros,
    cc_reales  = -cc_reales,
    cc_usdt    = -cc_usdt
where tipo = 'CTA CTE'
  and anulado = false
  and (
    (operacion = 'INGRESAN' and (cc_pesos > 0 or cc_dolares > 0 or cc_euros > 0 or cc_reales > 0 or coalesce(cc_usdt, 0) > 0))
    or
    (operacion = 'EGRESAN'  and (cc_pesos < 0 or cc_dolares < 0 or cc_euros < 0 or cc_reales < 0 or coalesce(cc_usdt, 0) < 0))
  );

-- Verificacion: tiene que devolver CERO filas.
select count(*) as filas_que_siguen_mal
from public.diario
where tipo = 'CTA CTE'
  and anulado = false
  and (
    (operacion = 'INGRESAN' and (cc_pesos > 0 or cc_dolares > 0 or cc_euros > 0 or cc_reales > 0 or coalesce(cc_usdt, 0) > 0))
    or
    (operacion = 'EGRESAN'  and (cc_pesos < 0 or cc_dolares < 0 or cc_euros < 0 or cc_reales < 0 or coalesce(cc_usdt, 0) < 0))
  );
