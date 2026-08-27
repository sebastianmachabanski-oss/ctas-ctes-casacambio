'use client'
import FiltroMultiple from '@/components/FiltroMultiple'

/**
 * Filtro de cliente de la pantalla de Transacciones.
 *
 * Es el genérico con las etiquetas puestas: el componente nació acá y se movió a
 * `components/FiltroMultiple` cuando Transferencias necesitó lo mismo (26/8/2026).
 */
export default function FiltroClientes({
  clientes, seleccionados, onChange,
}: {
  clientes: string[]
  seleccionados: string[]
  onChange: (nombres: string[]) => void
}) {
  return (
    <FiltroMultiple
      opciones={clientes}
      seleccionados={seleccionados}
      onChange={onChange}
      etiqueta="Filtrar por cliente"
    />
  )
}
