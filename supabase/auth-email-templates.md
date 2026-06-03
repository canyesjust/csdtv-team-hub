# Supabase auth email templates (CSDtv Team Hub)

Login and access-help emails use **Supabase Auth** templates (not the Resend `send-notification` path used by the daily digest). Softer copy and CSDtv branding help district filters treat these like normal staff mail.

## Subjects (paste in Dashboard)

| Template | Subject line |
|----------|--------------|
| **Magic link** | `Your CSDtv Team Hub link` |
| **Reset password / recovery** | `CSDtv Team Hub sign-in help` |

Avoid words like: *password reset*, *magic link*, *verify*, *security alert*, *action required*.

## Apply in Supabase Dashboard

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **Email Templates**.
2. **Magic link** — set subject above, paste HTML from `supabase/templates/magic_link.html`.
3. **Reset password** — set subject above, paste HTML from `supabase/templates/recovery.html`.
4. Save each template.
5. Under **Authentication → URL Configuration**, confirm **Site URL** is `https://www.csdtvstaff.org` (or your production URL).

## Apply via Management API (optional)

```bash
export SUPABASE_ACCESS_TOKEN="your-personal-access-token"  # https://supabase.com/dashboard/account/tokens
export PROJECT_REF="pmzhpatxnngiagfzwkul"

node --experimental-strip-types scripts/apply-auth-email-templates.mts
```

## Microsoft / district “Safe Links” note

Some district filters **prefetch** links in email, which can burn one-time login links before the user clicks. If interns still fail after copy changes:

- Consider OTP-style login (6-digit code) instead of a button link, or
- Use **Settings → Team → Set password** and skip email entirely.

## Invite emails

Team invites from **Settings → Invite** use the `invite-user` edge function (Resend), not these Supabase templates. Wording there is updated separately in `supabase/functions/invite-user/index.ts`.
