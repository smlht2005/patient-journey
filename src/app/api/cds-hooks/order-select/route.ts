/**
 * CDS Hooks — order-select
 * POST /api/cds-hooks/order-select
 * 修正：CORS origin 改由 ALLOWED_EHR_ORIGINS 環境變數控制。
 */
import { NextRequest, NextResponse } from 'next/server';
import { CdsHookRequest } from '@/types/cds';
import { processCdsRequest } from '@/lib/cds/cardBuilder';

function getCorsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = (process.env.ALLOWED_EHR_ORIGINS ?? '*').split(',').map(o => o.trim());
  const isAllowed = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin':  isAllowed ? (allowed.includes('*') ? '*' : origin) : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

export async function POST(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req);
  try {
    const body: CdsHookRequest = await req.json();
    if (body.hook !== 'order-select') {
      return NextResponse.json({ cards: [] }, { headers: corsHeaders });
    }
    const prefetchObs: any[] = (body.prefetch?.observations as any)?.entry
      ?.map((e: any) => e.resource) ?? [];
    const response = processCdsRequest(body, prefetchObs);
    return NextResponse.json(response, { headers: corsHeaders });
  } catch (err) {
    console.error('[order-select]', err);
    return NextResponse.json({ cards: [] }, { status: 200, headers: corsHeaders });
  }
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}
