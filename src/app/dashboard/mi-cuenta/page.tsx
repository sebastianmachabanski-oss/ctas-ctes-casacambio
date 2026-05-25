import CambiarClaveForm from './CambiarClaveForm'

export default function MiCuentaPage() {
  return (
    <div className="p-4 md:p-6 max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-gray-500 text-sm mt-1">Administrá tu acceso</p>
      </div>
      <CambiarClaveForm />
    </div>
  )
}
