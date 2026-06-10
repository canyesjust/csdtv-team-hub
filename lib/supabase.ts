import { createBrowserClient } from '@supabase/ssr'

function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Single shared browser client. The 50+ `createClient()` call sites across the
// app previously each spun up their own instance on every render; reusing one
// avoids that churn and keeps a single auth/session source in the tab.
let browserClient: ReturnType<typeof makeClient> | null = null

export function createClient() {
  return (browserClient ??= makeClient())
}
