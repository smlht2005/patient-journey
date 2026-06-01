export interface LLMMessage { role: 'user' | 'assistant'; content: string }

export interface LLMCallOptions {
  system?: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export const DEFAULT_MAX_TOKENS = 1500;
export const DEFAULT_TIMEOUT_MS = 15_000;
