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

  try {
    const db = createServerClient();
    const { count, error } = await db
      .from('offers')
      .select('*', { count: 'exact', head: true });
    checks['supabase_ok']    = !error;
    checks['offers_count']   = error ? error.message : count;
  } catch (e) {
    checks['supabase_ok']    = false;
    checks['supabase_error'] = (e as Error).message;
  }

  try {
    const db = createServerClient();
    const { data, error } = await db.rpc('match_offers', {
      p_month: 8, p_budget_cents: 200000,
      p_transport: ['flight'], p_audiences: ['couples'], p_motives: ['beach'],
    });
    checks['rpc_ok']    = !error;
    checks['rpc_rows']  = error ? error.message : (data as unknown[])?.length ?? 0;
  } catch (e) {
    checks['rpc_ok']    = false;
    checks['rpc_error'] = (e as Error).message;
  }

  return NextResponse.json(checks);
}
