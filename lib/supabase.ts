import { createBrowserClient } from '@supabase/ssr'

function readPublicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const v = process.env[name]
  if (v == null || v === '' || v === 'undefined') {
    throw new Error(
      `${name} is missing or invalid. Set it in Vercel → Project → Settings → Environment Variables and redeploy.`
    )
  }
  if (name === 'NEXT_PUBLIC_SUPABASE_URL' && !/^https?:\/\//i.test(v)) {
    throw new Error(
      `${name} must start with https:// (or http:// for local dev), e.g. https://xxxx.supabase.co`
    )
  }
  return v
}

export function createClient() {
  return createBrowserClient(readPublicEnv('NEXT_PUBLIC_SUPABASE_URL'), readPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
}