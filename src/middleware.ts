import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { esAdmin } from '@/lib/roles'
import { rutaActiva } from '@/lib/configuracion'

export async function middleware(request: NextRequest) {
  // Las funciones de Netlify (p.ej. sync-background) manejan su propia autenticación
  // —el cron valida SYNC_SECRET— y no deben pasar por el redirect a /login.
  if (request.nextUrl.pathname.startsWith('/.netlify/')) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Rutas públicas
  if (pathname === '/login') {
    if (user) return NextResponse.redirect(new URL('/dashboard', request.url))
    return supabaseResponse
  }

  // Requiere autenticación
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  // Usar service role para evitar problemas de RLS recursiva
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: profile } = await admin
    .from('profiles').select('rol, activo, debe_cambiar_clave').eq('id', user.id).single()

  // Cuenta inactiva
  if (!profile || !profile.activo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=cuenta_inactiva', request.url))
  }

  // Forzar cambio de clave — solo se puede ir a /dashboard/mi-cuenta
  if (profile.debe_cambiar_clave && !pathname.startsWith('/dashboard/mi-cuenta')) {
    return NextResponse.redirect(new URL('/dashboard/mi-cuenta?forzado=1', request.url))
  }

  // Solo administrador/superadmin pueden acceder a /admin
  if (pathname.startsWith('/dashboard/admin') && !esAdmin(profile.rol)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Módulos apagados en esta instalación (ver src/lib/configuracion.ts).
  //
  // Va ACÁ y no en cada pantalla por dos razones. Primero, es un solo lugar: una pantalla
  // nueva de un módulo apagado queda cubierta sola, sin que nadie se acuerde de agregarle
  // la guarda. Segundo, esconder la opción del menú NO apaga nada — con la URL en la mano
  // se entra igual, y el módulo seguiría existiendo para quien la tenga.
  //
  // No es una barrera de seguridad: el rol ya decidió qué puede ver esta persona. Es una
  // decisión de producto —qué contrató este cliente— y por eso manda al panel en lugar de
  // dar un error.
  if (!rutaActiva(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|\\.netlify|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
