import { createClient } from '@supabase/supabase-js';

// Browser/Edge client — uses anon key (RLS enforced)
export function createBrowserClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !key) throw new Error('Supabase env vars missing');
  return createClient(url, key);
}

// Server/API route client — uses service key (bypasses RLS)
export function createServerClient() {
  const url  = process.env['SUPABASE_URL'];
  const key  = process.env['SUPABASE_SERVICE_KEY'];
  if (!url || !key) throw new Error('Supabase service env vars missing');
  return createClient(url, key, { auth: { persistSession: false } });
}
