/**
 * POST /api/ai/voice-order
 * 語音 / 文字 → FHIR TW Core MedicationRequest 草稿
 * 
 * Body: VoiceOrderRequest
 * Response: VoiceOrderResponse
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseVoiceOrder } from '@/lib/ai/voiceOrderParser';
import { VoiceOrderRequest } from '@/types/ai';
import { getSession } from '@/lib/session/store';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const body: VoiceOrderRequest = await req.json();

    if (!body.text?.trim()) {
      return NextResponse.json({ success: false, error: '醫囑文字不可為空' }, { status: 400 });
    }

    // 若前端未帶 patientId，從 session 補入
    if (!body.patientId && session.patientId) {
      body.patientId = session.patientId;
    }

    const result = await parseVoiceOrder(body);
    return NextResponse.json(result);

  } catch (err) {
    console.error('[voice-order]', err);
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
