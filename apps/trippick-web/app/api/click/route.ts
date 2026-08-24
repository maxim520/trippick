import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '../../../lib/supabase.js';

interface ClickBody {
  offerId:   number;
  deeplink:  string;
  sessionId: string;
}

function parseBody(body: unknown): ClickBody {
  if (!body || typeof body !== 'object') throw new Error('body must be an object');
  const b = body as Record<string, unknown>;

  const offerId = Number(b['offerId']);
  if (!Number.isInteger(offerId) || offerId <= 0) throw new Error('offerId must be a positive integer');

  if (typeof b['deeplink'] !== 'string' || !b['deeplink'].startsWith('http'))
    throw new Error('deeplink must be an http(s) URL');

  if (typeof b['sessionId'] !== 'string' || b['sessionId'].length < 4)
    throw new Error('sessionId must be a string');

  return {
    offerId,
    deeplink:  b['deeplink']  as string,
    sessionId: b['sessionId'] as string,
  };
}

export async function POST(req: NextRequest) {
  let body: ClickBody;
  try {
    body = parseBody(await req.json());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const { error } = await db.from('clicks').insert({
      offer_id:   body.offerId,
      deeplink:   body.deeplink,
      session_id: body.sessionId,
      clicked_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[/api/click] insert error:', error);
      // Non-fatal: still return 204 so the deeplink isn't blocked
    }
  } catch (err) {
    console.error('[/api/click] unexpected error:', err);
  }

  return new NextResponse(null, { status: 204 });
}
