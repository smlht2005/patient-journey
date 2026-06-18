import { callClaudeProvider, ClaudeMessage, ClaudeCallOptions, safeParseJson } from './claudeClient';
import { callDeepSeekProvider } from './deepseekClient';
import { callGeminiProvider } from './geminiClient';
import type { LLMMessage, LLMCallOptions } from './llmTypes';

export type { ClaudeMessage, ClaudeCallOptions };
export type { LLMMessage, LLMCallOptions };
export { safeParseJson };

const DEFAULT_PROVIDER = 'gemini';
const VALID_PROVIDERS = ['gemini', 'claude', 'deepseek'] as const;
type Provider = typeof VALID_PROVIDERS[number];

/**
 * LLM 供應商路由（依 LLM_PROVIDER 切換，預設 gemini）。
 * 註：函式名保留 callClaude 以相容既有呼叫端；實際供應商由 LLM_PROVIDER 決定。
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const raw = (process.env.LLM_PROVIDER ?? DEFAULT_PROVIDER).toLowerCase();
  const provider: Provider = (VALID_PROVIDERS as readonly string[]).includes(raw)
    ? (raw as Provider)
    : (() => {
        console.warn(`[llmClient] 未知的 LLM_PROVIDER="${raw}"，fallback 至 ${DEFAULT_PROVIDER}`);
        return DEFAULT_PROVIDER as Provider;
      })();
  if (provider === 'claude') return callClaudeProvider(opts);
  if (provider === 'deepseek') return callDeepSeekProvider(opts);
  return callGeminiProvider(opts);
}
