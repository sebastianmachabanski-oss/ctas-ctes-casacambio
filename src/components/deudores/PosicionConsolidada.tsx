'use client'
import { useMemo, useState } from 'react'

/**
 * Posición consolidada de cuentas corrientes.
 *
 * QUÉ CAMBIÓ Y POR QUÉ
 * Hasta el 8/9/2026 esta pantalla listaba SOLO los saldos positivos: lo que los clientes
 * deben. La otra mitad —lo que la casa les debe a ellos— no aparecía en ningún lado, así
 * que el listado no era una posición sino la mitad de una. Ahora se ven los dos lados y
 * el neto por moneda.
 *
 * CONVENCIÓN DE SIGNO (viene de la planilla, no se toca)
 *   saldo POSITIVO → el cliente debe            → "nos deben"
 *   saldo NEGATIVO → el cliente tiene a favor   → "le debemos"
 *
 * DOS COSAS QUE NO SE HACEN, A PROPÓSITO
 *
 * 1. No se netean monedas distintas entre sí. Cada moneda tiene su propia línea de a
 *    favor / en contra / neto. Juntar dólares con pesos exigiría una cotización, y esa
 *    cotización la elegiría el programa: el número saldría de un supuesto, no de los
 *    datos. La posición real es un vector de cinco monedas, y así se muestra.
 *
 * 2. Los totales NO cambian con los filtros de la tabla. La posición consolidada es la de
 *    todas las cuentas; si se moviera al escribir en el buscador dejaría de ser la
 *    posición y pasaría a ser el subtotal de lo que uno está mirando, que es otra cosa y
 *    se presta a leerla mal.
 *
 * UNA CUENTA PUEDE ESTAR EN LOS DOS LADOS A LA VEZ: deber dólares y tener pesos a favor.
 * Esas cuentas aparecen en las DOS listas, cada vez con el lado que corresponde: en "Nos
 * deben" se ven solo sus saldos positivos, en "Le debemos" solo los negativos. Se marcan
 * con ⇄ para que se sepa que la otra mitad existe y está del otro lado.
 *
 * La alternativa —mostrarlas enteras en las dos listas— rompía la cuenta: el subtotal de
 * "Nos deben" arrastraba las patas negativas y no daba lo mismo que la tarjeta de arriba.
 * Partiéndolas por lado, cada vista cierra contra su tarjeta.
 */

import {
  MONEDAS, MODOS, LADO, val, visto, esMixta, posicionPorMoneda,
  filtrarPorLado, subtotales, ordenarPor,
  type Saldo, type ClaveMoneda, type Modo,
} from '@/lib/posicion'

export type { Saldo }

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (v: number) => (v < 0 ? `(${nf.format(-v)})` : nf.format(v))
const fecha = (s: string | null) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('es-AR') : '—')

export default function PosicionConsolidada({ saldos }: { saldos: Saldo[] }) {
  const [modo, setModo] = useState<Modo>('todas')
  const [busca, setBusca] = useState('')
  const [orden, setOrden] = useState<{ col: string; dir: 1 | -1 }>({ col: 'saldo_dolares', dir: -1 })

  // Solo las monedas que alguna cuenta mueve: con las cinco siempre visibles, media tabla
  // son guiones.
  const columnas = useMemo(() => {
    const activas = MONEDAS.filter(m => saldos.some(s => val(s, m.key) !== 0))
    return activas.length ? activas : MONEDAS.slice(0, 2)
  }, [saldos])

  const posicion = useMemo(() => posicionPorMoneda(saldos), [saldos])
  const lado = LADO[modo]
  const ver = (s: Saldo, k: ClaveMoneda) => visto(s, k, lado)

  const visibles = useMemo(
    () => ordenarPor(filtrarPorLado(saldos, lado, busca), orden.col, orden.dir, lado),
    [saldos, busca, orden, lado],
  )
  const mixtasVisibles = useMemo(() => visibles.filter(esMixta).length, [visibles])

  // Un clic ordena por la columna; el segundo da vuelta el sentido. Los importes y la
  // fecha arrancan de mayor a menor (lo grande y lo reciente es lo que se busca); el
  // nombre, alfabético.
  function ordenar(col: string) {
    setOrden(o => o.col === col
      ? { col, dir: (o.dir === 1 ? -1 : 1) as 1 | -1 }
      : { col, dir: col === 'cuenta_cte' ? 1 : -1 })
  }
  const flecha = (col: string) => (orden.col === col ? (orden.dir === 1 ? ' ▲' : ' ▼') : '')

  // Subtotales de lo que está en pantalla. Van rotulados como tales para que no se
  // confundan con la posición de arriba, que es de todas las cuentas.
  const subs = subtotales(visibles, lado)

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Posición por moneda: los dos lados y el neto */}
      <div>
        <div className="kpis">
          {posicion.map(p => (
            <div key={p.key} className="kpi">
              <div className="top"><span className="dot" style={{ background: p.color }} /><span className="cur">{p.label}</span></div>
              <div className={`val num ${p.neto >= 0 ? '' : 'neg'}`}>{p.sym} {money(p.neto)}</div>
              <div className="val-lbl">posición neta</div>
              <div className="sub">
                <div className="kr"><span>Nos deben</span><b className="pos">{p.sym} {nf.format(p.favor)}</b></div>
                <div className="kr"><span>Le debemos</span><b className="neg">{p.sym} {money(p.contra)}</b></div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: '8px 2px 0', fontSize: 12, color: 'var(--muted)' }}>
          Posición de <b>todas</b> las cuentas: no cambia con los filtros de la tabla. Cada moneda
          va por su cuenta — no se suman dólares con pesos, porque eso exigiría una cotización y el
          número saldría de un supuesto, no de los datos. Una cuenta que debe en una moneda y tiene
          a favor en otra figura en las dos solapas, cada vez con la mitad que corresponde.
        </p>
      </div>

      <div className="card">
        {/* "Cuentas con saldo" y no "Cuentas corrientes": ese nombre ya es el de otra
            pantalla del menú y tenerlo dos veces confunde. */}
        <div className="card-h"><h2 className="card-t">Cuentas con saldo</h2></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 16px 10px', flexWrap: 'wrap' }}>
          <div className="tabs">
            {MODOS.map(m => (
              <button key={m.key} className={`tab ${modo === m.key ? 'on' : ''}`}
                title={m.ayuda} onClick={() => setModo(m.key)}>{m.label}</button>
            ))}
          </div>
          <input className="srch" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cuenta…" aria-label="Buscar cuenta" style={{ flex: 1, minWidth: 160 }} />
        </div>

        <div className="tbl-wrap">
          <table className="cc-tbl">
            <thead>
              <tr>
                <th><Th col="cuenta_cte" orden={ordenar} flecha={flecha}>Cuenta corriente</Th></th>
                {columnas.map(c => (
                  <th key={c.key}><Th col={c.key} orden={ordenar} flecha={flecha}>{c.label}</Th></th>
                ))}
                <th><Th col="ultimo_movimiento" orden={ordenar} flecha={flecha}>Último mov.</Th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(s => (
                <tr key={s.cuenta_cte}>
                  <td>
                    {s.cuenta_cte}
                    {/* La cuenta también figura en la otra vista con su otra mitad. Sin
                        esta marca, "nos debe 5.000" se leería como toda su posición. */}
                    {esMixta(s) && (
                      <span title={modo === 'contra'
                        ? 'Esta cuenta además tiene saldo pendiente: se ve en «Nos deben»'
                        : 'Esta cuenta además tiene saldo a favor: se ve en «Le debemos»'}
                        style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--muted)', cursor: 'help' }}>
                        ⇄
                      </span>
                    )}
                  </td>
                  {columnas.map(c => {
                    const v = ver(s, c.key)
                    return (
                      <td key={c.key} className={`num ${v < 0 ? 'neg' : ''}`}>
                        {v === 0 ? <span className="zero">—</span> : money(v)}
                      </td>
                    )
                  })}
                  <td style={{ color: 'var(--muted)', fontWeight: 400 }}>{fecha(s.ultimo_movimiento)}</td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr><td colSpan={columnas.length + 2} style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 16px' }}>
                  No hay cuentas para este filtro
                </td></tr>
              )}
            </tbody>
            {visibles.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--grid)' }}>
                  <td style={{ fontWeight: 700 }}>Subtotal de lo listado</td>
                  {columnas.map(c => {
                    const v = subs[c.key]
                    return (
                      <td key={c.key} className={`num ${v < 0 ? 'neg' : ''}`} style={{ fontWeight: 700 }}>
                        {v === 0 ? <span className="zero">—</span> : money(v)}
                      </td>
                    )
                  })}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div style={{ padding: '10px 16px 12px', color: 'var(--muted)', fontSize: 12 }}>
          {visibles.length} cuenta{visibles.length !== 1 ? 's' : ''} · {MODOS.find(m => m.key === modo)!.ayuda.toLowerCase()}
          {' · '}los importes entre paréntesis son saldos <b>a favor del cliente</b>
          {mixtasVisibles > 0 && (
            <>
              {' · '}<b>⇄</b> {mixtasVisibles} cuenta{mixtasVisibles !== 1 ? 's' : ''} con saldo de los dos
              signos{modo === 'todas' ? '' : ': acá se ve solo esta mitad, la otra está en la otra solapa'}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Encabezado que ordena. Va como botón y no como th con onClick para que se llegue con
// el teclado, que es como se navega una tabla larga.
function Th({ col, orden, flecha, children }: {
  col: string; orden: (c: string) => void; flecha: (c: string) => string; children: React.ReactNode
}) {
  return (
    <button type="button" onClick={() => orden(col)}
      style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', letterSpacing: 'inherit', textTransform: 'inherit' }}>
      {children}{flecha(col)}
    </button>
  )
}
