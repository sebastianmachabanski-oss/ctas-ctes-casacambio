type Saldo = {
  cuenta_cte: string; saldo_pesos: number | null; saldo_dolares: number | null
  saldo_euros: number | null; saldo_reales: number | null
}
interface Props { saldos: Saldo[]; cuentaCte: string | null }

const MONEDAS = [
  { key: 'saldo_dolares' as const, label: 'Dólares', sym: 'U$S', color: 'bg-green-50 border-green-200 text-green-900' },
  { key: 'saldo_pesos'   as const, label: 'Pesos',   sym: '$',   color: 'bg-blue-50 border-blue-200 text-blue-900'    },
  { key: 'saldo_euros'   as const, label: 'Euros',   sym: '€',   color: 'bg-purple-50 border-purple-200 text-purple-900' },
  { key: 'saldo_reales'  as const, label: 'Reales',  sym: 'R$',  color: 'bg-orange-50 border-orange-200 text-orange-900' },
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {mostrar.map(m => {
        const v = t[m.key] ?? 0
        const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(Math.abs(v))
        return (
          <div key={m.key} className={`card border p-3 md:p-4 ${m.color}`}>
            <p className="text-xs font-medium opacity-70 uppercase tracking-wide mb-1">{m.label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-medium opacity-60">{m.sym}</span>
              <span className="text-xl md:text-2xl font-bold">{n}</span>
            </div>
            <p className="text-xs opacity-60 mt-1">
              {v < 0 ? 'A tu favor' : v > 0 ? 'Saldo pendiente' : 'Sin movimientos'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
