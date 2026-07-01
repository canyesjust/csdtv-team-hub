import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { STUDENT_INTERN_HOME_PATH, STUDENT_INTERN_ROLE, isSignageEditorRole } from './lib/roles'
import { isDashboardPathAllowed } from './lib/dashboard-access'
import { getActorTeamRow, getEffectiveTeamRow } from './lib/server/effective-team'

const BRAND_REVIEW_COOKIE = 'csd_brand_review'

// Edge-runtime helpers (no Node `Buffer`/`crypto` module available here).
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

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

  // The /brand password gate itself runs in the server layout (app/brand/layout.tsx),
  // which can read the DB-backed password. Here we only translate a valid review link
  // (?review=KEY) into a review cookie so review users pass that server gate on the
  // first load and on later navigations that drop the ?review= param.
  if (pathname === '/brand' || pathname.startsWith('/brand/')) {
    const reviewParam = request.nextUrl.searchParams.get('review')
    const reviewKey = process.env.BRAND_REVIEW_KEY
    if (reviewParam && reviewKey && safeEqualHex(await sha256Hex(reviewParam), await sha256Hex(reviewKey))) {
      response.cookies.set(BRAND_REVIEW_COOKIE, await sha256Hex(`brand-review:${reviewKey}`), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    }
    return response
  }

  const requiresTeam = pathname.startsWith('/dashboard') || pathname.startsWith('/control')

  if (user && requiresTeam) {
    const teamAccess = await getEffectiveTeamRow(supabase, user)
    if (teamAccess === null) {
      await supabase.auth.signOut()
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('reason', 'not-on-team')
      const redirectResponse = NextResponse.redirect(loginUrl)
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value)
      })
      return redirectResponse
    }
    const role = teamAccess === 'pending-link' ? null : teamAccess.role
    const dashboardProfile =
      teamAccess === 'pending-link' ? null : teamAccess.dashboard_profile
    const signageRole =
      teamAccess === 'pending-link' ? null : teamAccess.signage_role

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

    // Signage-only editors are locked to the signage tool; anything else → overview.
    if (isSignageEditorRole(signageRole)) {
      const inSignage = pathname === '/dashboard/signage' || pathname.startsWith('/dashboard/signage/')
      if (!inSignage) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard/signage/overview'
        return NextResponse.redirect(url)
      }
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
  matcher: ['/dashboard/:path*', '/board/:path*', '/control/:path*', '/brand', '/brand/:path*'],
}
