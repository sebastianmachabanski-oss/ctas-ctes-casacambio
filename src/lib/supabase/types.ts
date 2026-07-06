export type UserRole = 'superusuario' | 'operador' | 'cliente'
export interface Profile {
  id: string; email: string; nombre: string; rol: UserRole
  activo: boolean; cuenta_cte: string | null; created_at: string; updated_at: string
  // Permiso individual (superadmin): acceso al módulo de Ganancias, independiente del rol.
  ve_ganancias?: boolean
}
export interface DiarioRow {
  id: string; fecha: string; tipo: string; cuenta_cte: string
  operacion: string; concepto: string | null; evento: string | null
  detalle: string | null; recibo: string | null; moneda: string; monto: number
  cc_pesos: number | null; cc_dolares: number | null; cc_euros: number | null; cc_reales: number | null
  cotizacion: number | null
  anulado: boolean; anulado_por: string | null; anulado_at: string | null
  motivo_anulacion: string | null; notas: string | null; creado_por: string | null
  created_at: string; updated_at: string
}
export interface SaldoCuentaCorriente {
  cuenta_cte: string; saldo_pesos: number | null; saldo_dolares: number | null
  saldo_euros: number | null; saldo_reales: number | null; ultimo_movimiento: string | null
}
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile,'created_at'|'updated_at'>; Update: Partial<Profile> }
      diario: { Row: DiarioRow; Insert: Omit<DiarioRow,'id'|'created_at'|'updated_at'>; Update: Partial<DiarioRow> }
    }
    Views: { saldos_cuenta_corriente: { Row: SaldoCuentaCorriente } }
    Functions: { get_my_role: { Returns: UserRole }; get_my_cuenta_cte: { Returns: string | null } }
  }
}

// Extender Profile con campo telefono
declare module './types' {
  interface Profile {
    telefono?: string | null
  }
}

// Funciones adicionales
export interface FuncionesExtra {
  marcar_clave_cambiada: {
    Args: { p_user_id: string }
    Returns: void
  }
}

// Funciones adicionales
export interface FuncionesExtra {
  marcar_clave_cambiada: {
    Args: { p_user_id: string }
    Returns: void
  }
}
