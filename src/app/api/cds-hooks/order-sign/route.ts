/**
 * CDS Hooks — order-sign
 * POST /api/cds-hooks/order-sign
 *
 * 修正：CORS origin 改由 ALLOWED_EHR_ORIGINS 環境變數控制，
 * 取代原本 Access-Control-Allow-Origin: * 的過度開放設定。
 */
import { NextRequest, NextResponse } from 'next/server';
import { CdsHookRequest } from '@/types/cds';
import { processCdsRequest } from '@/lib/cds/cardBuilder';
import { fhirFetch } from '@/lib/fhir/client';
import { getSession } from '@/lib/session/store';

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
    if (body.hook !== 'order-sign') {
      return NextResponse.json({ cards: [] }, { headers: corsHeaders });
    }

    let prefetchObs: any[] = (body.prefetch?.observations as any)?.entry
      ?.map((e: any) => e.resource) ?? [];

    if (prefetchObs.length === 0) {
      try {
        const session = await getSession();
        const patientId = (body.context as any).patientId ?? session.patientId;
        if (patientId && session.accessToken) {
          const res = await fhirFetch(`Observation?patient=${patientId}&_count=100&_sort=-date`);
          const bundle = await res.json();
          prefetchObs = bundle.entry?.map((e: any) => e.resource) ?? [];
        }
      } catch { /* 無 observations 也繼續 */ }
    }

    const response = processCdsRequest(body, prefetchObs);
    return NextResponse.json(response, { headers: corsHeaders });

  } catch (err) {
    console.error('[order-sign]', err);
    return NextResponse.json({ cards: [] }, { status: 200, headers: corsHeaders });
  }
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}
