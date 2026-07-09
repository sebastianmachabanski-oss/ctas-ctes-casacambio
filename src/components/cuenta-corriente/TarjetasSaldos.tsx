type Saldo = {
  cuenta_cte: string; saldo_pesos: number | null; saldo_dolares: number | null
  saldo_euros: number | null; saldo_reales: number | null
}
interface Props { saldos: Saldo[]; cuentaCte: string | null }

// Tarjetas de saldo con el estilo del tablero (KPI: punto de color + valor grande).
const MONEDAS = [
  { key: 'saldo_dolares' as const, label: 'Dólares', sym: 'U$S', color: '#16a34a' },
  { key: 'saldo_pesos'   as const, label: 'Pesos',   sym: '$',   color: '#2563eb' },
  { key: 'saldo_euros'   as const, label: 'Euros',   sym: '€',   color: '#7c3aed' },
  { key: 'saldo_reales'  as const, label: 'Reales',  sym: 'R$',  color: '#eab308' },
]

export default function TarjetasSaldos({ saldos }: Props) {
  const t = saldos.reduce((a, s) => ({
    saldo_pesos:   (a.saldo_pesos   ?? 0) + (s.saldo_pesos   ?? 0),
    saldo_dolares: (a.saldo_dolares ?? 0) + (s.saldo_dolares ?? 0),
    saldo_euros:   (a.saldo_euros   ?? 0) + (s.saldo_euros   ?? 0),
    saldo_reales:  (a.saldo_reales  ?? 0) + (s.saldo_reales  ?? 0),
  }), { saldo_pesos: 0, saldo_dolares: 0, saldo_euros: 0, saldo_reales: 0 })

  const conSaldo = MONEDAS.filter(m => (t[m.key] ?? 0) !== 0)
  const mostrar = conSaldo.length > 0 ? conSaldo : MONEDAS.slice(0, 2)

  return (
    <div className="saldos">
      {mostrar.map(m => {
        const v = t[m.key] ?? 0
        const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Math.abs(v))
        // Convención de la planilla: saldo positivo = el cliente debe (pendiente);
        // negativo = a favor del cliente.
        const nota = v > 0 ? 'saldo pendiente' : v < 0 ? 'a favor del cliente' : 'sin movimientos'
        return (
          <div className="saldo-card" key={m.key} style={{ borderLeft: `3px solid ${m.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="dot" style={{ background: m.color }} /><span className="cur">Saldo {m.label}</span>
            </div>
            <div className="val num">{m.sym} {v < 0 ? `(${n})` : n}</div>
            <div className="nota">{nota}</div>
          </div>
        )
      })}
    </div>
  )
}
