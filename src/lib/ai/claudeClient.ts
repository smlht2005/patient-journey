import { LLMMessage, LLMCallOptions, DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS } from './llmTypes';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL      = 'claude-sonnet-4-20250514';

export type ClaudeMessage     = LLMMessage;
export type ClaudeCallOptions = LLMCallOptions;

export async function callClaudeProvider(opts: LLMCallOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定，請確認 .env.local');

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: opts.messages,
  };
  if (opts.system)               body.system      = opts.system;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(無法讀取)');
    throw new Error(`Claude API 錯誤 ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => { throw new Error('Claude API 回傳非法 JSON'); });
  return data.content?.[0]?.text ?? '';
}

/** 安全的 JSON 解析：去除 markdown fences 後解析 */
export function safeParseJson<T>(text: string): T | null {
  try {
    const clean = text
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    return JSON.parse(clean) as T;
  } catch {
    return null;
  }
}
