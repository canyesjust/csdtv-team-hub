# Contact CRM — Phase 2: Inbound BCC capture

Phase 2 lets a team member capture an email into the CRM by **BCC-ing a capture
address** when they email an external contact. The email is received by **Resend**
(inbound), which calls our webhook; the webhook stages the contact and interaction
for manager review. Approved items flow into the Phase 1 CRM (timeline,
last-contacted, follow-ups).

Capture is intentionally **review-gated**: nothing the webhook creates appears in
the live Contacts list until a manager approves it.

## Pieces

| Piece | Location |
| --- | --- |
| DB migration (capture RPC, idempotency, retention purge) | `db/contact_crm_phase_2.sql` |
| Manager-only review RLS | `db/contact_crm_phase_2_manager_review.sql` |
| Inbound webhook (Resend + generic paths) | `app/api/contacts/inbound/route.ts` |
| Address parsing / recipient logic (pure, unit-tested) | `lib/contacts-inbound.ts` |
| Svix signature verifier (Resend webhook auth) | `lib/server/svix.ts` |
| Claude summary edge function | `supabase/functions/summarize-interaction/index.ts` |
| Review queue UI (managers) | `app/dashboard/contacts/review/page.tsx` |
| Contacts list filter + review link | `app/dashboard/contacts/page.tsx` |

## Flow

1. A team member emails `contact@vendor.com` and BCCs the capture address
   (an address at the Resend receiving domain, e.g. `crm@inbound.csdtv.org`).
2. Resend receives the email and POSTs a Svix-signed `email.received` event to
   `POST /api/contacts/inbound`. **The event carries metadata only — not the body.**
3. The webhook verifies the Svix signature (`RESEND_WEBHOOK_SECRET`), then fetches
   the body via `GET https://api.resend.com/emails/receiving/{id}` using
   `RESEND_API_KEY`.
4. It confirms the **From** is an active team member and derives the external
   recipients (To + Cc, minus the sender, all team members, and the capture
   address).
5. For each external recipient it calls the service-role-only
   `capture_inbound_contact()` RPC, which dedup-matches an existing contact (via
   `find_contact_match`) or stages a new one as `pending_review`, then logs the
   interaction as `source='bcc'`, `review_state='pending'`, with `body_purge_after`
   set from the retention window.
6. Best-effort: the webhook calls the `summarize-interaction` edge function to
   replace the fallback summary with a one-line Claude summary, and emails active
   managers that items await review.
7. The interaction shows up in **Contacts → Review queue** (Managers only).
   Approving promotes a staged contact to `active` and the interaction to
   `approved` (which updates `last_contacted_at` via the Phase 1 trigger).
   Rejecting discards the interaction and removes the staged contact if nothing
   else is attached.

## Setting up Resend inbound

Resend (already used by Team Hub for sending) also receives email. Setup:

1. **Receiving domain / MX.** In Resend → Emails → Receiving, either use the
   provided `<id>.resend.app` domain or add a custom domain. Because the root
   domain already has MX records for normal email, **use a subdomain** (e.g.
   `inbound.csdtv.org`) and add Resend's MX record there with the **lowest
   priority**. Any address at that domain is then received (e.g.
   `crm@inbound.csdtv.org`).
2. **Webhook.** In Resend → Webhooks → Add Webhook, set the URL to
   `https://<your-app>/api/contacts/inbound` and select the **`email.received`**
   event. Copy the webhook **signing secret** → set it as `RESEND_WEBHOOK_SECRET`
   in Vercel.
3. **API key.** Ensure `RESEND_API_KEY` is set in the **Vercel** environment (the
   webhook uses it to fetch the email body). It can be the same key used for
   sending.
4. **Capture address.** Set `CONTACTS_INBOUND_ADDRESS` to the capture address so
   it's never captured as a contact. Tell staff to BCC that address when emailing
   external contacts.

Resend stores received emails, so if the webhook is briefly down it retries and
nothing is lost.

## Environment variables

Set in Vercel (server-only — never `NEXT_PUBLIC_*`):

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `RESEND_WEBHOOK_SECRET` | yes (Resend) | — | Svix signing secret for the inbound webhook. The Resend path is off (503) until set. |
| `RESEND_API_KEY` | yes (Resend) | — | Fetches the received email body. Reuse the existing sending key. |
| `CONTACTS_INBOUND_ADDRESS` | recommended | — | The capture address, excluded from captured contacts. |
| `CONTACTS_BODY_RETENTION_DAYS` | no | `90` | Days before `body_raw` is nulled by the purge job (1–3650). |
| `NEXT_PUBLIC_SITE_URL` | no | — | Builds the review-queue link in the manager email (falls back to `VERCEL_URL`). |
| `CONTACTS_INBOUND_SECRET` | no | — | Enables the **generic** path (below) for testing/forwarders. Off until set. |

`ANTHROPIC_API_KEY` is already configured on the Supabase edge functions (shared
with `extract-agenda`); the summary function reuses it. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected into edge functions by the platform.

When new contacts are captured, active **managers** are emailed immediately via
the existing `send-notification` edge function with a link to the review queue
(best-effort; a failed notification never affects capture). Fully-deduped
re-deliveries do not trigger a notification.

## Generic path (testing / alternate forwarders)

If `svix-signature` is absent, the webhook accepts a normalized JSON body with a
shared secret — handy for `curl` tests or a non-Resend forwarder:

```
POST /api/contacts/inbound
Authorization: Bearer <CONTACTS_INBOUND_SECRET>     (or  x-webhook-secret: <secret>)
Content-Type: application/json

{
  "from": "Jane Manager <jane@csdtv.org>",
  "to": ["Bob Vendor <bob@vendor.com>"],   // string or array; comma-separated allowed
  "cc": [],
  "subject": "Re: Parade quote",
  "text": "plain-text body",               // html used as fallback if text missing
  "html": "<p>...</p>",
  "messageId": "<abc123@mail>",            // recommended (dedup key)
  "receivedAt": "2026-06-26T18:00:00Z"
}
```

Responses (both paths): `{ ok, captured, created, deduped }` on success;
`{ ok, ignored }` when the sender isn't a team member or there are no external
recipients (treated as success — don't retry).

## Security notes

- `/api/contacts/inbound` is a public route (exempt from the middleware auth
  gate). It self-gates two ways: the **Resend path** verifies the Svix signature
  (`lib/server/svix.ts`, constant-time, with a timestamp tolerance to blunt
  replays); the **generic path** compares `CONTACTS_INBOUND_SECRET` in constant
  time (`lib/server/security.ts → timingSafeEqualStr`). It's rate-limited via the
  durable limiter (`scope: 'contacts_inbound'`, 120/min/IP).
- All input is bounded: ≤25 recipients, subject ≤998 chars, body ≤100 KB.
- Only mail whose **From** matches an active `team.email` is captured. Unknown
  senders are acknowledged and ignored, so the endpoint can't be used to inject
  arbitrary contacts.
- `capture_inbound_contact()` and `prune_contact_interaction_bodies()` are
  `SECURITY DEFINER` with `EXECUTE` revoked from `public`/`anon`/`authenticated`;
  only `service_role` (the webhook) can call the capture RPC, and the purge runs
  only from pg_cron.
- `message_id` + a unique partial index `(contact_id, external_message_id)` make
  webhook retries idempotent.
- Captured `body_raw` is nulled after `CONTACTS_BODY_RETENTION_DAYS` by an hourly
  pg_cron job; the one-line summary is retained.
- **The review surface is Manager-only at the data layer.** RLS restricts
  `pending_review` contacts and `pending` interactions to `public.is_manager()`;
  `active` contacts and `approved` interactions remain visible to all
  authenticated team members (Phase 1 behaviour unchanged). The review page and
  the "Review queue" link are also gated to managers in the UI, but RLS is the
  real boundary — a non-manager hitting the API directly sees nothing pending.
  See `db/contact_crm_phase_2_manager_review.sql`.

## Verifying after wiring

1. Set `RESEND_WEBHOOK_SECRET`, `RESEND_API_KEY` (and optionally the others) in
   Vercel and deploy.
2. Add the receiving subdomain + MX in Resend and create the `email.received`
   webhook pointing at `/api/contacts/inbound`.
3. Send a test email to an external address with the capture address BCC'd.
4. Confirm a card appears in **Contacts → Review queue** (as a manager) with a
   Claude summary. If the summary stays as the subject-line fallback, check the
   `summarize-interaction` function logs (likely `ANTHROPIC_API_KEY`). If nothing
   appears at all, check the webhook deliveries in Resend and the Vercel logs for
   `/api/contacts/inbound` (401 = signature/secret mismatch).
5. Approve it and confirm it appears in Contacts with the interaction on the
   timeline and `last_contacted_at` updated.
