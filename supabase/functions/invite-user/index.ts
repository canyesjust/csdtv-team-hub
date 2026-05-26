// Creates auth account + team record + sends invite email with magic link.
// Deploy: supabase functions deploy invite-user --no-verify-jwt
// Secrets: RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY (auto), SITE_URL optional

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type User } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function siteBase(): string {
  const fromEnv = Deno.env.get("SITE_URL") ?? Deno.env.get("NEXT_PUBLIC_SITE_URL")
  if (fromEnv?.trim()) return fromEnv.replace(/\/$/, "")
  return "https://www.csdtvstaff.org"
}

function authCallbackUrl(): string {
  return `${siteBase()}/auth/callback?next=${encodeURIComponent("/dashboard")}`
}

/** Paginated lookup — listUsers() only returns the first page by default. */
async function findAuthUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<User | null> {
  const target = email.toLowerCase()
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`Auth lookup failed: ${error.message}`)
    const match = data.users.find((u) => u.email?.toLowerCase() === target)
    if (match) return match
    if (data.users.length < perPage) return null
    page += 1
    if (page > 50) return null
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return json({ error: "No auth header" }, 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const resendKey = Deno.env.get("RESEND_API_KEY")
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server configuration error" }, 500)
    }
    if (!resendKey) {
      return json({ error: "RESEND_API_KEY is not configured on invite-user" }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const callerToken = authHeader.replace(/^Bearer\s+/i, "")
    const { data: { user: callerAuth }, error: callerErr } = await supabase.auth.getUser(callerToken)
    if (callerErr || !callerAuth) {
      return json({ error: "Invalid token" }, 401)
    }

    const { data: callerTeam } = await supabase
      .from("team")
      .select("role")
      .eq("supabase_user_id", callerAuth.id)
      .single()

    if (!callerTeam || callerTeam.role !== "Manager") {
      return json({ error: "Only managers can invite users" }, 403)
    }

    const body = await req.json()
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const role = typeof body.role === "string" ? body.role.trim() : ""
    const avatar_color = typeof body.avatar_color === "string" ? body.avatar_color : "#e8a020"

    if (!email || !name || !role) {
      return json({ error: "Missing email, name, or role" }, 400)
    }

    const { data: existingTeam } = await supabase
      .from("team")
      .select("id, supabase_user_id")
      .eq("email", email)
      .maybeSingle()

    let teamId = existingTeam?.id
    let authUserId = existingTeam?.supabase_user_id ?? undefined

    if (!authUserId) {
      const existingAuth = await findAuthUserByEmail(supabase, email)
      if (existingAuth) {
        authUserId = existingAuth.id
      } else {
        const tempPassword = crypto.randomUUID() + "Aa1!"
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
        })
        if (createError) {
          return json({ error: `Auth error: ${createError.message}` }, 400)
        }
        authUserId = newUser.user.id
      }
    }

    if (teamId) {
      const { error: teamUpdateErr } = await supabase
        .from("team")
        .update({ supabase_user_id: authUserId, active: true, name, role, avatar_color })
        .eq("id", teamId)
      if (teamUpdateErr) {
        return json({ error: `Team error: ${teamUpdateErr.message}` }, 400)
      }
    } else {
      const { data: newTeam, error: teamError } = await supabase
        .from("team")
        .insert({
          name,
          email,
          role,
          avatar_color,
          supabase_user_id: authUserId,
          active: true,
        })
        .select("id")
        .single()

      if (teamError) {
        return json({ error: `Team error: ${teamError.message}` }, 400)
      }
      teamId = newTeam.id
    }

    const redirectTo = authCallbackUrl()
    const { data: magicLink, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    })

    if (linkError) {
      return json({
        error: `Could not create sign-in link: ${linkError.message}`,
        teamId,
        authUserId,
      }, 400)
    }

    const loginUrl = magicLink?.properties?.action_link
    if (!loginUrl) {
      return json({
        error: "Could not create sign-in link (empty action_link). Check Supabase Auth redirect URLs.",
        teamId,
        authUserId,
      }, 400)
    }

    const firstName = name.split(" ")[0] || name
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;color:#1a1f36">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="font-size:24px;margin:0 0 4px">Welcome to CSDtv Team Hub</h1>
          <p style="color:#6b7280;margin:0">You've been invited to join the team</p>
        </div>
        <p>Hi ${firstName},</p>
        <p>You've been added to the CSDtv Team Hub as <strong>${role}</strong>. This is where we manage productions, tasks, schedules, equipment, and everything else.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${loginUrl}" style="display:inline-block;background:#1e6cb5;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:16px">
            Sign in to CSDtv Team Hub
          </a>
        </div>
        <p style="font-size:14px;color:#6b7280">This link will sign you in automatically. After your first login, you can use the magic link option on the login page — just enter your email and we'll send you a sign-in link.</p>
        <p style="font-size:14px;color:#6b7280">Site: <a href="${siteBase()}" style="color:#1e6cb5">csdtvstaff.org</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="font-size:12px;color:#9ca3af;margin:0">CSDtv Production Office · Canyon School District</p>
      </div>
    `

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CSDtv <noreply@csdtvstaff.org>",
        to: email,
        subject: "You're invited to CSDtv Team Hub",
        html,
      }),
    })

    const resendBody = await resendRes.json().catch(() => ({}))
    if (!resendRes.ok) {
      const detail =
        typeof resendBody === "object" && resendBody !== null && "message" in resendBody
          ? String((resendBody as { message?: string }).message)
          : resendRes.statusText
      return json({
        error: `Account created but invite email failed: ${detail}`,
        teamId,
        authUserId,
        emailSent: false,
      }, 502)
    }

    return json({
      success: true,
      message: `Invite sent to ${email}`,
      teamId,
      authUserId,
      emailSent: true,
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
