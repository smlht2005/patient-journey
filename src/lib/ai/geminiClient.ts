import { LLMCallOptions, DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS } from './llmTypes';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// 金鑰與模型沿用 care_rag_api 慣例：GOOGLE_API_KEY + GEMINI_MODEL_NAME
// 預設 gemini-2.5-flash（gemini-2.0-flash 已停用 404；建議用 2.5+ 系列）
const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function callGeminiProvider(opts: LLMCallOptions): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY 未設定，請確認 .env.local');
  const model = process.env.GEMINI_MODEL_NAME?.trim() || DEFAULT_MODEL;

  // Gemini 角色對映：assistant → model；system 走 system_instruction
  const contents = opts.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      // 關閉 thinking：本服務輸出為結構化 FHIR JSON / 摘要，停用思考可確保
      // 完整輸出（避免思考佔用 token 預算導致截斷）、降低延遲與成本。（gemini-2.5+ 支援）
      thinkingConfig: { thinkingBudget: 0 },
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    },
  };
  if (opts.system) body.system_instruction = { parts: [{ text: opts.system }] };

  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '(無法讀取)');
    throw new Error(`Gemini API 錯誤 ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json().catch(() => { throw new Error('Gemini API 回傳非法 JSON'); });

  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? '')
    .join('');
  if (!text) {
    const reason = cand?.finishReason ?? data.promptFeedback?.blockReason ?? '未知';
    throw new Error(`Gemini API 無有效回應（finishReason=${reason}）`);
  }
  return text;
}
