import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (_client) return _client;

  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_KEY'];

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. ' +
      'Copy .env.example to .env and fill in your credentials.',
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}

// Typed helper: throw on Supabase error instead of returning it silently
export async function dbQuery<T>(
  promise: Promise<{ data: T | null; error: unknown }>,
  context: string,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`[db:${context}] ${JSON.stringify(error)}`);
  if (data === null) throw new Error(`[db:${context}] returned null`);
  return data;
}
