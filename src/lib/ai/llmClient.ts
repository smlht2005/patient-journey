import { callClaudeProvider, ClaudeMessage, ClaudeCallOptions, safeParseJson } from './claudeClient';
import { callDeepSeekProvider } from './deepseekClient';
import type { LLMMessage, LLMCallOptions } from './llmTypes';

export type { ClaudeMessage, ClaudeCallOptions };
export type { LLMMessage, LLMCallOptions };
export { safeParseJson };

const VALID_PROVIDERS = ['claude', 'deepseek'] as const;
type Provider = typeof VALID_PROVIDERS[number];

export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const raw = (process.env.LLM_PROVIDER ?? 'deepseek').toLowerCase();
  const provider: Provider = (VALID_PROVIDERS as readonly string[]).includes(raw)
    ? (raw as Provider)
    : (() => {
        console.warn(`[llmClient] 未知的 LLM_PROVIDER="${raw}"，fallback 至 deepseek`);
        return 'deepseek' as Provider;
      })();
  if (provider === 'claude') return callClaudeProvider(opts);
  return callDeepSeekProvider(opts);
}
