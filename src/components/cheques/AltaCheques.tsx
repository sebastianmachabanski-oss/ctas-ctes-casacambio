'use client'
import SubirImagen from '@/components/cheques/SubirImagen'
import { chequeNuevoVacio, pesosExacto, sumaDeCheques, type ChequeNuevo } from '@/lib/cheques'

// Carga de los cheques de una operación de descuento (23/11/2026).
//
// UNA OPERACIÓN TRAE N CHEQUES: el cliente llega con cinco y se lleva un solo pago. Por
// eso el nominal de la operación NO se tipea: lo calcula esta lista. Un importe escrito
// aparte es un descuadre esperando a pasar, y es exactamente lo que
// `cheques_descuadrados()` existe para encontrar.

const celda: React.CSSProperties = {
  width: '100%', fontSize: 13, padding: '7px 9px',
  border: '1px solid var(--ring)', borderRadius: 8, fontFamily: 'inherit',
}

export default function AltaCheques({ cheques, onChange, fechaOperacion, deshabilitado }: {
  cheques: ChequeNuevo[]
  onChange: (c: ChequeNuevo[]) => void
  fechaOperacion: string
  deshabilitado?: boolean
}) {
  const total = sumaDeCheques(cheques)

  const cambiar = (i: number, campo: keyof ChequeNuevo, valor: unknown) =>
    onChange(cheques.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)))

  function agregar() {
    // El librador, el CUIT y el banco se heredan de la última fila: una tanda suele venir
    // de uno o dos libradores, y volver a tipear el CUIT en cada cheque es donde aparecen
    // las variantes de escritura que después parten la concentración en dos.
    const ultimo = cheques[cheques.length - 1]
    onChange([...cheques, {
      ...chequeNuevoVacio(),
      fecha_emision: fechaOperacion || null,
      librador: ultimo?.librador ?? '',
      cuit_librador: ultimo?.cuit_librador ?? null,
      banco: ultimo?.banco ?? null,
      tipo: ultimo?.tipo ?? 'papel',
    }])
  }

  const quitar = (i: number) => onChange(cheques.filter((_, j) => j !== i))

  return (
    <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Cheques de la operación</div>
        </div>
        <div className="num" style={{ fontSize: 15, fontWeight: 700 }}>
          {cheques.length} · {pesosExacto(total)}
        </div>
      </div>

      {cheques.map((c, i) => (
        <div key={i} style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          alignItems: 'end', borderTop: i ? '1px solid var(--grid)' : undefined,
          paddingTop: i ? 10 : 0,
        }}>
          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Número</span>
            <input style={celda} value={c.numero} disabled={deshabilitado}
              onChange={e => cambiar(i, 'numero', e.target.value)} />
          </label>

          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Importe</span>
            <input style={celda} className="num" type="number" step="0.01" min="0"
              value={c.importe || ''} disabled={deshabilitado}
              onChange={e => cambiar(i, 'importe', Number(e.target.value) || 0)} />
          </label>

          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Vence</span>
            <input style={celda} type="date" value={c.fecha_pago} disabled={deshabilitado}
              onChange={e => cambiar(i, 'fecha_pago', e.target.value)} />
          </label>

          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Librador</span>
            <input style={celda} value={c.librador} disabled={deshabilitado}
              onChange={e => cambiar(i, 'librador', e.target.value)} />
          </label>

          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>CUIT</span>
            <input style={celda} className="num" value={c.cuit_librador ?? ''} disabled={deshabilitado}
              onChange={e => cambiar(i, 'cuit_librador', e.target.value || null)} />
          </label>

          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Banco</span>
            <input style={celda} value={c.banco ?? ''} disabled={deshabilitado}
              onChange={e => cambiar(i, 'banco', e.target.value || null)} />
          </label>

          <label style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Tipo</span>
            <select style={celda} value={c.tipo} disabled={deshabilitado}
              onChange={e => cambiar(i, 'tipo', e.target.value as 'papel' | 'echeq')}>
              <option value="papel">Papel</option>
              <option value="echeq">Echeq</option>
            </select>
          </label>

          <div style={{ display: 'grid', gap: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Imagen</span>
            <SubirImagen compacto deshabilitado={deshabilitado}
              valor={c.archivo_url}
              onChange={ruta => cambiar(i, 'archivo_url', ruta)} />
          </div>

          <button type="button" className="chip" disabled={deshabilitado}
            onClick={() => quitar(i)}
            aria-label={`Quitar el cheque ${i + 1}${c.numero ? `, número ${c.numero}` : ''}`}>
            Quitar
          </button>
        </div>
      ))}

      <div>
        <button type="button" className="chip" onClick={agregar} disabled={deshabilitado}>
          + Agregar cheque
        </button>
      </div>
    </div>
  )
}
