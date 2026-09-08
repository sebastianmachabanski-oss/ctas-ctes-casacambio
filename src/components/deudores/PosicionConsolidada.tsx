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
 * Por eso "nos deben" y "le debemos" no parten el listado en dos mitades excluyentes, y
 * por eso existe el filtro "Mixtas": son justamente las que el listado viejo mostraba
 * a medias.
 */

export type Saldo = {
  cuenta_cte: string
  saldo_pesos: number | null
  saldo_dolares: number | null
  saldo_euros: number | null
  saldo_reales: number | null
  saldo_usdt: number | null
  ultimo_movimiento: string | null
}

type ClaveMoneda = 'saldo_dolares' | 'saldo_pesos' | 'saldo_euros' | 'saldo_reales' | 'saldo_usdt'

const MONEDAS: { key: ClaveMoneda; label: string; sym: string; color: string }[] = [
  { key: 'saldo_dolares', label: 'Dólares', sym: 'U$S',  color: '#16a34a' },
  { key: 'saldo_pesos',   label: 'Pesos',   sym: '$',    color: '#2563eb' },
  { key: 'saldo_euros',   label: 'Euros',   sym: '€',    color: '#7c3aed' },
  { key: 'saldo_reales',  label: 'Reales',  sym: 'R$',   color: '#eab308' },
  // USDT solo puede venir de la app: en la planilla no existe (25/8/2026).
  { key: 'saldo_usdt',    label: 'USDT',    sym: 'USDT', color: '#26a17b' },
]

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (v: number) => (v < 0 ? `(${nf.format(-v)})` : nf.format(v))
const fecha = (s: string | null) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('es-AR') : '—')
const val = (s: Saldo, k: ClaveMoneda) => Number(s[k]) || 0

type Modo = 'todas' | 'favor' | 'contra' | 'mixtas'
const MODOS: { key: Modo; label: string; ayuda: string }[] = [
  { key: 'todas',  label: 'Todas',       ayuda: 'Todas las cuentas con saldo' },
  { key: 'favor',  label: 'Nos deben',   ayuda: 'Cuentas con saldo pendiente en alguna moneda' },
  { key: 'contra', label: 'Le debemos',  ayuda: 'Cuentas con saldo a favor del cliente en alguna moneda' },
  { key: 'mixtas', label: 'Mixtas',      ayuda: 'Deben en una moneda y tienen a favor en otra' },
]

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

  // La posición: por moneda, lo que nos deben, lo que debemos y el neto. Sobre TODAS las
  // cuentas — ver el comentario de arriba sobre por qué no depende de los filtros.
  const posicion = useMemo(() => MONEDAS.map(m => {
    let favor = 0, contra = 0
    for (const s of saldos) {
      const v = val(s, m.key)
      if (v > 0) favor += v
      else contra += v
    }
    return { ...m, favor, contra, neto: favor + contra }
  }).filter(p => p.favor !== 0 || p.contra !== 0), [saldos])

  const visibles = useMemo(() => {
    const q = busca.trim().toUpperCase()
    const filas = saldos.filter(s => {
      if (q && !(s.cuenta_cte || '').toUpperCase().includes(q)) return false
      const debe = MONEDAS.some(m => val(s, m.key) > 0)
      const aFavor = MONEDAS.some(m => val(s, m.key) < 0)
      if (modo === 'favor') return debe
      if (modo === 'contra') return aFavor
      if (modo === 'mixtas') return debe && aFavor
      return debe || aFavor
    })
    const { col, dir } = orden
    return filas.sort((a, b) => {
      if (col === 'cuenta_cte') return dir * (a.cuenta_cte || '').localeCompare(b.cuenta_cte || '', 'es')
      if (col === 'ultimo_movimiento') return dir * (a.ultimo_movimiento ?? '').localeCompare(b.ultimo_movimiento ?? '')
      return dir * (val(a, col as ClaveMoneda) - val(b, col as ClaveMoneda))
        || (a.cuenta_cte || '').localeCompare(b.cuenta_cte || '', 'es')
    })
  }, [saldos, busca, modo, orden])

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
  const subtotal = (k: ClaveMoneda) => visibles.reduce((a, s) => a + val(s, k), 0)

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
          número saldría de un supuesto, no de los datos.
        </p>
      </div>

      <div className="card">
        <div className="card-h"><h2 className="card-t">Cuentas corrientes</h2></div>
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
                  <td>{s.cuenta_cte}</td>
                  {columnas.map(c => {
                    const v = val(s, c.key)
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
                    const v = subtotal(c.key)
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
