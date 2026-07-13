// Loader del área de contenido: Next lo muestra mientras carga la pantalla elegida.
// Aparece recién a los ~350 ms (animación con delay): si la transición es rápida,
// nunca llega a verse y no genera sensación de lentitud.
export default function DashboardLoading() {
  return (
    <>
      <style>{`
        .cc-loader { opacity: 0; animation: ccLoaderIn .2s ease .35s forwards; }
        @keyframes ccLoaderIn { to { opacity: 1; } }
      `}</style>
      <div className="cc-loader" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '55vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <svg className="animate-spin" style={{ width: 34, height: 34, color: 'var(--brand)' }} viewBox="0 0 24 24" fill="none">
            <circle style={{ opacity: 0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path style={{ opacity: 0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>
        </div>
      </div>
    </>
  )
}
