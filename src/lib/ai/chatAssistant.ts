/**
 * AI 臨床對話助理 (Clinical Chat Assistant)
 *
 * 修正：過濾 system role 訊息而非轉為 user role，
 * 避免 AI 誤讀對話角色（system 內容已由 system param 處理）。
 */
import { callClaude } from './claudeClient';
import { ChatRequest, ChatResponse } from '@/types/ai';

const BASE_SYSTEM = `你是 Patient Journey 系統的 AI 臨床助理，
協助醫師快速解讀病人資料、回答臨床問題，並提供循證醫學建議。

核心原則：
1. 使用繁體中文（zh-TW）回答，專業術語可附英文。
2. 建議需符合台灣健保規範與 TW Core FHIR 標準。
3. 若問題超出能力範圍，明確說明並建議諮詢相關科別。
4. 不直接下醫療決策，強調「建議醫師評估」。
5. 若涉及緊急狀況（如血氧 <90%、SBP >180），優先強調立即處置。
6. 回答簡潔（≤200字），可使用 Markdown 條列。`;

function buildSystemWithContext(req: ChatRequest): string {
  if (!req.patientContext) return BASE_SYSTEM;
  const { patientName, patientId, activeAlerts, keyLabs } = req.patientContext;
  return `${BASE_SYSTEM}

目前照護病人：${patientName}（ID: ${patientId}）
主動警示：${activeAlerts.length > 0 ? activeAlerts.join('、') : '無'}
關鍵檢驗：${keyLabs || '無'}

回答時可參考以上病人資訊。`;
}

export async function runChatAssistant(req: ChatRequest): Promise<ChatResponse> {
  const system = buildSystemWithContext(req);

  // 修正：過濾 system role 而非轉換為 user role
  // system 內容已透過 system param 傳入 Claude，不需重複出現在 messages 中
  const recentMessages = req.messages
    .filter(m => m.role === 'user' || m.role === 'assistant') // ← 關鍵修正
    .slice(-10)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // 確保 messages 不為空（Claude API 要求至少一條 user 訊息）
  if (recentMessages.length === 0 || recentMessages[recentMessages.length - 1].role !== 'user') {
    return { reply: '（沒有有效的使用者訊息可處理）' };
  }

  const reply = await callClaude({
    system,
    messages: recentMessages,
    maxTokens: 500,
    temperature: 0.4,
  });

  return { reply };
}
