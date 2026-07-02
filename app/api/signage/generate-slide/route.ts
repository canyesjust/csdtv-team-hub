import { NextRequest, NextResponse } from 'next/server'
import { requireSignageEditorApi } from '@/lib/signage/server-auth'
import {
  buildSlidePrompt,
  validateSlideHtml,
  wordCapForType,
  SLIDE_TYPES,
  type SlideType,
  type SlideMotion,
  type SlideOrientation,
} from '@/lib/signage/slide-guardrails'

export const dynamic = 'force-dynamic'

const VALID_TYPES = new Set(SLIDE_TYPES.map(t => t.value))
const VALID_MOTION = new Set<SlideMotion>(['none', 'subtle', 'lively'])
const VALID_DWELL = new Set([10, 15, 20])

// The district logo is no longer baked in by the model. Editors overlay the real
// brand-library logo (with a chosen position) after generation, which is exact
// and consistent — see /api/signage/district-logo and Create with AI.

async function callGenerator(system: string, user: string): Promise<{ html?: string; error?: string }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return { error: 'Supabase URL not configured' }
  try {
    const res = await fetch(`${base}/functions/v1/generate-signage-slide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        'x-signage-generate-secret': process.env.SIGNAGE_GENERATE_SECRET || '',
      },
      body: JSON.stringify({ system, user }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: typeof data.error === 'string' ? data.error : 'Generation failed' }
    return { html: data.html }
  } catch {
    return { error: 'Could not reach the generator' }
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSignageEditorApi()
  if ('error' in auth) return auth.error
  const { service } = auth

  const body = await request.json().catch(() => ({}))
  const prompt = String(body.prompt ?? '').trim()
  const type = body.type as SlideType
  const motion = (body.motion ?? 'subtle') as SlideMotion
  const orientation = (body.orientation === 'portrait' ? 'portrait' : 'landscape') as SlideOrientation
  const dwellSeconds = VALID_DWELL.has(Number(body.dwell_seconds)) ? Number(body.dwell_seconds) : 15
  const headlineOverride = body.headline_override ? String(body.headline_override).trim().slice(0, 120) : null
  const siteId = String(body.site_id ?? '').trim()
  // Refine mode: tweak an existing slide instead of generating a fresh one.
  const refineInstruction = body.refine_instruction ? String(body.refine_instruction).trim().slice(0, 600) : null
  const previousHtml = body.previous_html ? String(body.previous_html).slice(0, 80_000) : null
  const isRefine = Boolean(refineInstruction && previousHtml)

  if (!prompt) return NextResponse.json({ error: 'A prompt is required.' }, { status: 400 })
  if (prompt.length > 1000) return NextResponse.json({ error: 'Prompt is too long.' }, { status: 400 })
  if (!VALID_TYPES.has(type)) return NextResponse.json({ error: 'Invalid slide type.' }, { status: 400 })
  if (!VALID_MOTION.has(motion)) return NextResponse.json({ error: 'Invalid motion setting.' }, { status: 400 })
  if (!siteId) return NextResponse.json({ error: 'Missing site.' }, { status: 400 })

  // Brand: school primary_color (authoritative) → site bg_color → navy.
  const { data: site } = await service
    .from('signage_sites')
    .select('name, slug, school_code, bg_color, accent_color')
    .eq('id', siteId)
    .maybeSingle()
  if (!site) return NextResponse.json({ error: 'Site not found.' }, { status: 404 })

  let schoolPrimary: string | null = null
  if (site.school_code) {
    const { data: school } = await service
      .from('schools')
      .select('primary_color')
      .ilike('code', site.school_code)
      .maybeSingle()
    schoolPrimary = school?.primary_color ?? null
  }
  const accent = schoolPrimary || site.bg_color || site.accent_color || '#065687'
  const shortCode = (site.school_code || site.slug || 'CSD').toUpperCase().slice(0, 4)

  const canvas = orientation === 'portrait' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 }
  const params = {
    prompt, type, motion, orientation, canvas, dwellSeconds, headlineOverride,
    brand: { locationName: site.name, shortCode, accent, logoDataUri: null },
  }
  const wordCap = wordCapForType(type)

  // Generate (or refine an existing slide), validate, and retry once with the
  // specific failures fed back. In refine mode we hand the model the current
  // HTML and ask for a targeted edit so unrelated parts stay put.
  const { system, user } = buildSlidePrompt(params)
  const genUser = isRefine
    ? `${user}\n\nHere is the CURRENT slide HTML:\n\n${previousHtml}\n\nApply ONLY this change, keeping everything else identical (same layout, wording, and styling except where the change requires otherwise):\n"${refineInstruction}"\n\nReturn only the full corrected HTML document.`
    : user

  let result = await callGenerator(system, genUser)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })

  let check = validateSlideHtml(result.html || '', { wordCap, headlineOverride })
  if (!check.ok) {
    const retryUser = `${genUser}\n\nThe previous attempt failed these readability rules — fix them and return only the corrected HTML:\n- ${check.failures.join('\n- ')}`
    result = await callGenerator(system, retryUser)
    if (result.error) return NextResponse.json({ error: result.error }, { status: 502 })
    check = validateSlideHtml(result.html || '', { wordCap, headlineOverride })
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Could not produce a slide that meets the readability rules. Try simplifying the prompt.', failures: check.failures },
        { status: 422 },
      )
    }
  }

  return NextResponse.json({
    html: result.html,
    canvas,
    gen_meta: {
      prompt, type, motion, orientation, dwell_seconds: dwellSeconds,
      headline_override: headlineOverride, model: 'claude-sonnet-4-6',
      refined: isRefine || undefined,
    },
  })
}
