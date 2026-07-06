import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { sanitizeNextPath } from '@/lib/shared/share'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Single-user personal app: the redirect below is a UX gate, not the security
  // boundary (Postgres RLS + PowerSync token validation are). getSession() reads
  // the session from cookies locally instead of doing a Supabase auth round-trip
  // on every request, which keeps navigations fast on poor mobile networks. It
  // still refreshes an expired token (writing new cookies via setAll) when needed.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user

  const isLoginPage = request.nextUrl.pathname === '/login'
  const isAuthCallback = request.nextUrl.pathname.startsWith('/auth/callback')
  const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`

  // Allow auth callback through always
  if (isAuthCallback) {
    return supabaseResponse
  }

  // Not logged in and not on login page → redirect to login
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', requestedPath)
    return NextResponse.redirect(url)
  }

  // Logged in and on login page → redirect to dashboard
  if (user && isLoginPage) {
    const next = sanitizeNextPath(request.nextUrl.searchParams.get('next'))
    return NextResponse.redirect(new URL(next, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, icon.svg, etc.
     * - manifest.json
     * - sw.js (service worker)
     * - swe-worker-*.js (serwist workers)
     * - workbox-*.js
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|icon-.*\\.png|manifest\\.json|robots\\.txt|sw\\.js|swe-worker-.*\\.js|workbox-.*\\.js).*)',
  ],
}
