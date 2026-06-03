import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { STUDENT_INTERN_HOME_PATH, STUDENT_INTERN_ROLE } from './lib/roles'
import { isDashboardPathAllowed } from './lib/dashboard-access'
import { getActorTeamRow, getEffectiveTeamRow } from './lib/server/effective-team'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes — no auth required
  const publicPaths = ['/login', '/signage', '/submit-task', '/board', '/_next', '/favicon', '/images', '/api']
  if (publicPaths.some(p => pathname.startsWith(p)) || pathname === '/') {
    return NextResponse.next()
  }

  // Check for Supabase session
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const requiresTeam = pathname.startsWith('/dashboard') || pathname.startsWith('/control')

  if (user && requiresTeam) {
    const teamAccess = await getEffectiveTeamRow(supabase, user)
    if (teamAccess === null) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('reason', 'not-on-team')
      return NextResponse.redirect(loginUrl)
    }
    const role = teamAccess === 'pending-link' ? null : teamAccess.role
    const dashboardProfile =
      teamAccess === 'pending-link' ? null : teamAccess.dashboard_profile

    if (teamAccess !== 'pending-link') {
      const actorRow = await getActorTeamRow(supabase, user)
      const isViewAs =
        actorRow &&
        actorRow !== 'pending-link' &&
        actorRow.id !== teamAccess.id
      if (
        isViewAs &&
        (pathname.startsWith('/dashboard/settings') ||
          pathname.startsWith('/dashboard/onboarding/admin'))
      ) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    }

    // Student Interns use a dedicated home at /dashboard/student
    if (role === STUDENT_INTERN_ROLE && (pathname === '/dashboard' || pathname === '/dashboard/')) {
      const url = request.nextUrl.clone()
      url.pathname = STUDENT_INTERN_HOME_PATH
      return NextResponse.redirect(url)
    }

    if (
      role &&
      !isDashboardPathAllowed(pathname, role, dashboardProfile)
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // If no user and trying to access dashboard or control surface, redirect to login
  if (!user && requiresTeam) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/board/:path*', '/control/:path*'],
}
