/**
 * POST /api/ai/summarize
 * 依病人 ViewModel 產生 AI 智慧摘要
 * 
 * Body: SummarizeRequest
 * Response: SummarizeResponse
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateSummary } from '@/lib/ai/summarizer';
import { SummarizeRequest } from '@/types/ai';

export async function POST(req: NextRequest) {
  try {
    const body: SummarizeRequest = await req.json();
    if (!body.patientId) {
      return NextResponse.json({ error: 'patientId 為必填' }, { status: 400 });
    }
    const result = await generateSummary(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[summarize]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
