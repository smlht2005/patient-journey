import { callClaudeProvider, ClaudeMessage, ClaudeCallOptions, safeParseJson } from './claudeClient';
import { callDeepSeekProvider } from './deepseekClient';

export type { ClaudeMessage, ClaudeCallOptions };
export { safeParseJson };

export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  const provider = (process.env.LLM_PROVIDER ?? 'claude').toLowerCase();
  if (provider === 'deepseek') return callDeepSeekProvider(opts);
  return callClaudeProvider(opts);
}
