import CambiarClaveForm from './CambiarClaveForm'

export default function MiCuentaPage({
  searchParams
}: {
  searchParams: { forzado?: string }
}) {
  const forzado = searchParams.forzado === '1'
  return (
    <div className="p-4 md:p-6 max-w-lg">
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
