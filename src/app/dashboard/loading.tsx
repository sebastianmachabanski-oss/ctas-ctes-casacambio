// Loader del área de contenido: Next lo muestra automáticamente mientras carga la
// pantalla elegida en el menú (la barra lateral y la topbar quedan visibles).
export default function DashboardLoading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '55vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <svg className="animate-spin" style={{ width: 34, height: 34, color: 'var(--brand)' }} viewBox="0 0 24 24" fill="none">
          <circle style={{ opacity: 0.2 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path style={{ opacity: 0.8 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando…</p>
      </div>
    </div>
  )
}
