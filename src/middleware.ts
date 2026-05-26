import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  const { data: profile } = await supabase
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

  // Solo superusuario puede acceder a /admin
  if (pathname.startsWith('/dashboard/admin') && profile.rol !== 'superusuario') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
