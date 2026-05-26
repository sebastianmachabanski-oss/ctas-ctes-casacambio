import CambiarClaveForm from './CambiarClaveForm'

export default function MiCuentaPage({
  searchParams
}: {
  searchParams: { forzado?: string }
}) {
  const forzado = searchParams.forzado === '1'
  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-gray-500 text-sm mt-1">Administrá tu acceso</p>
      </div>
      {forzado && (
        <div className="mb-5 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm">
          <p className="font-semibold mb-1">⚠️ Debés cambiar tu contraseña para continuar</p>
          <p>Por seguridad, tu contraseña inicial debe ser reemplazada por una personal antes de usar la aplicación.</p>
        </div>
      )}
      <CambiarClaveForm forzado={forzado} />
    </div>
  )
}
