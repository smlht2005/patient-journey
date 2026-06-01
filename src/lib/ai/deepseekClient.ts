import { LLMCallOptions, DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS } from './llmTypes';

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const MODEL        = 'deepseek-chat';

export async function callDeepSeekProvider(opts: LLMCallOptions): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未設定，請確認 .env.local');

  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push(...opts.messages);

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;

  const res = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(無法讀取)');
    throw new Error(`DeepSeek API 錯誤 ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => { throw new Error('DeepSeek API 回傳非法 JSON'); });

  const content = data.choices?.[0]?.message?.content;
  if (content == null || data.choices?.length === 0) {
    throw new Error(`DeepSeek API 無有效回應（choices 為空或 content 為 null）`);
  }
  return content as string;
}
