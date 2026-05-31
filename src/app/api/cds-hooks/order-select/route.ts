/**
 * CDS Hooks — order-select
 * POST /api/cds-hooks/order-select
 * 
 * 觸發時機：醫師在 CPOE 介面選取 / 新增藥品草稿時
 * 執行：DDI 即時攔截 + critical 閾值 + AI 預判
 * 目標回應時間：< 500ms（規範要求）
 */
import { NextRequest, NextResponse } from 'next/server';
import { CdsHookRequest } from '@/types/cds';
import { processCdsRequest } from '@/lib/cds/cardBuilder';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: NextRequest) {
  try {
    const body: CdsHookRequest = await req.json();

    if (body.hook !== 'order-select') {
      return NextResponse.json({ cards: [] }, { headers: CORS });
    }

    // 取 prefetch observations（EHR 提供）或空陣列
    const prefetchObs: any[] = body.prefetch?.observations?.entry
      ?.map((e: any) => e.resource) ?? [];

    const response = processCdsRequest(body, prefetchObs);
    return NextResponse.json(response, { headers: CORS });

  } catch (err) {
    console.error('[order-select]', err);
    // CDS 規範：發生錯誤時回 200 + 空 cards，不應讓 EHR 流程中斷
    return NextResponse.json({ cards: [] }, { status: 200, headers: CORS });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
