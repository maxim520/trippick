import { NextRequest, NextResponse } from 'next/server';
import { queryMatch } from '../../../lib/match-query';
import type { UserProfile } from 'navago-widget';

const TRANSPORT_MODES = new Set(['flight', 'car', 'train', 'bus']);
const AUDIENCES       = new Set(['couple', 'family', 'solo', 'friends', 'seniors']);
const MOTIVES         = new Set(['beach', 'city', 'nature', 'culture', 'active']);

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

function parseBody(body: unknown): UserProfile {
  if (!body || typeof body !== 'object') throw new Error('body must be an object');
  const b = body as Record<string, unknown>;

  const month = Number(b['month']);
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new Error('month must be 1–12');

  const budgetCents = Number(b['budgetCents']);
  if (!Number.isFinite(budgetCents) || budgetCents < 5000 || budgetCents > 1_000_000)
    throw new Error('budgetCents must be 5000–1000000');

  if (!isStringArray(b['transport']) || b['transport'].length === 0)
    throw new Error('transport must be a non-empty array');
  if (b['transport'].some(t => !TRANSPORT_MODES.has(t)))
    throw new Error('transport contains invalid value');

  if (!isStringArray(b['audiences']) || b['audiences'].length === 0)
    throw new Error('audiences must be a non-empty array');
  if (b['audiences'].some(a => !AUDIENCES.has(a)))
    throw new Error('audiences contains invalid value');

  if (!isStringArray(b['motives']) || b['motives'].length === 0)
    throw new Error('motives must be a non-empty array');
  if (b['motives'].some(m => !MOTIVES.has(m)))
    throw new Error('motives contains invalid value');

  // Widget uses singular 'couple'; DB audiences use plural 'couples'
  const audiences = (b['audiences'] as string[]).map(a => a === 'couple' ? 'couples' : a);

  return {
    month,
    budgetCents,
    transport: b['transport'] as UserProfile['transport'],
    audiences: audiences as UserProfile['audiences'],
    motives:   b['motives']   as UserProfile['motives'],
  };
}

export async function POST(req: NextRequest) {
  let profile: UserProfile;
  try {
    profile = parseBody(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }

  try {
    const results = await queryMatch(profile);
    return NextResponse.json({ results });
  } catch (err) {
    console.error('[/api/match] queryMatch error:', err);
    return NextResponse.json(
      { error: 'internal server error' },
      { status: 500 },
    );
  }
}
