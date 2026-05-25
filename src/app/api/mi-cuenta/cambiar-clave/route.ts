import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function validarClave(clave: string): string | null {
  if (clave.length < 8)          return 'Mínimo 8 caracteres'
  if (!/[A-Z]/.test(clave))      return 'Debe incluir al menos una mayúscula'
  if (!/[a-z]/.test(clave))      return 'Debe incluir al menos una minúscula'
  if (!/[0-9]/.test(clave))      return 'Debe incluir al menos un número'
  if (!/[!@#$%&*]/.test(clave))  return 'Debe incluir al menos un carácter especial (!@#$%&*)'
  return null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { clave_actual, clave_nueva, clave_confirmacion } = await request.json()

  if (!clave_actual || !clave_nueva || !clave_confirmacion)
    return NextResponse.json({ error: 'Completá todos los campos' }, { status: 400 })

  if (clave_nueva !== clave_confirmacion)
    return NextResponse.json({ error: 'Las claves nuevas no coinciden' }, { status: 400 })

  const error_validacion = validarClave(clave_nueva)
  if (error_validacion)
    return NextResponse.json({ error: error_validacion }, { status: 400 })

  // Verificar clave actual reautenticando
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!, password: clave_actual
  })
  if (signInError)
    return NextResponse.json({ error: 'La clave actual es incorrecta' }, { status: 400 })

  // Actualizar clave
  const { error } = await supabase.auth.updateUser({ password: clave_nueva })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
