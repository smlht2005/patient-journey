/**
 * Anthropic Claude API 客戶端
 * 
 * 統一封裝對 Claude claude-sonnet-4-20250514 的呼叫，供以下服務使用：
 *   - 語音轉 FHIR MedicationRequest（/api/ai/voice-order）
 *   - AI 智慧摘要（/api/ai/summarize）
 *   - AI 對話助理（/api/ai/chat）
 * 
 * 環境變數：ANTHROPIC_API_KEY（伺服端，永不暴露給前端）
 */

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1500;

export interface ClaudeMessage { role: 'user' | 'assistant'; content: string }

export interface ClaudeCallOptions {
  system?: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
}

export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定');

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: opts.maxTokens ?? MAX_TOKENS,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API 錯誤 ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

/** 安全的 JSON 解析：去除 markdown fences 後解析 */
export function safeParseJson<T>(text: string): T | null {
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean) as T;
  } catch {
    return null;
  }
}
