/**
 * CDS Hooks — order-sign
 * POST /api/cds-hooks/order-sign
 * 
 * 觸發時機：醫師按下「簽署」按鈕前的最終審核
 * 執行：DDI + 全套閾值 + AI 建議三層完整審核
 * 此為「最後防線」，應回傳最完整的 cards。
 */
import { NextRequest, NextResponse } from 'next/server';
import { CdsHookRequest } from '@/types/cds';
import { processCdsRequest } from '@/lib/cds/cardBuilder';
import { fhirFetch } from '@/lib/fhir/client';
import { getSession } from '@/lib/session/store';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: NextRequest) {
  try {
    const body: CdsHookRequest = await req.json();

    if (body.hook !== 'order-sign') {
      return NextResponse.json({ cards: [] }, { headers: CORS });
    }

    // 優先用 EHR prefetch；若無則自行從 FHIR 取（需 session token）
    let prefetchObs: any[] = body.prefetch?.observations?.entry
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
      } catch { /* fallback: 無 observations 也繼續 */ }
    }

    const response = processCdsRequest(body, prefetchObs);
    return NextResponse.json(response, { headers: CORS });

  } catch (err) {
    console.error('[order-sign]', err);
    return NextResponse.json({ cards: [] }, { status: 200, headers: CORS });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
