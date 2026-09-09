import { NextResponse } from 'next/server';
import { createServerClient } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rawUrl = process.env['SUPABASE_URL'] ?? '';
  const checks: Record<string, unknown> = {
    SUPABASE_URL_set:      !!rawUrl,
    SUPABASE_URL_preview:  rawUrl ? rawUrl.slice(0, 30) + '…' : '(niet gezet)',
    SUPABASE_SERVICE_KEY:  !!process.env['SUPABASE_SERVICE_KEY'],
    NEXT_PUBLIC_API_BASE:  process.env['NEXT_PUBLIC_API_BASE'] ?? '(leeg)',
  };

  // Raw fetch test — bypass supabase client entirely
  try {
    const url = process.env['SUPABASE_URL']!;
    const key  = process.env['SUPABASE_SERVICE_KEY']!;
    const r = await fetch(`${url}/rest/v1/offers?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    checks['raw_fetch_status'] = r.status;
    checks['raw_fetch_ok']     = r.ok;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { cause?: unknown };
    checks['raw_fetch_ok']    = false;
    checks['raw_fetch_error'] = err.message;
    checks['raw_fetch_cause'] = String((err.cause as Error)?.message ?? err.cause ?? '');
    checks['raw_fetch_code']  = err.code ?? '';
  }

  try {
    const db = createServerClient();
    const { count, error } = await db
      .from('offers')
      .select('*', { count: 'exact', head: true });
    checks['supabase_ok']    = !error;
    checks['offers_count']   = error ? error.message : count;
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { cause?: unknown };
    checks['supabase_ok']    = false;
    checks['supabase_error'] = err.message;
    checks['supabase_cause'] = String((err.cause as Error)?.message ?? err.cause ?? '');
  }

  return NextResponse.json(checks);
}
