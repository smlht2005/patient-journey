/**
 * POST /api/ai/chat
 * AI 臨床對話助理（帶病人 context）
 * 
 * Body: ChatRequest
 * Response: ChatResponse
 */
import { NextRequest, NextResponse } from 'next/server';
import { runChatAssistant } from '@/lib/ai/chatAssistant';
import { ChatRequest } from '@/types/ai';

export async function POST(req: NextRequest) {
  try {
    const body: ChatRequest = await req.json();
    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages 不可為空' }, { status: 400 });
    }
    const result = await runChatAssistant(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[ai-chat]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
