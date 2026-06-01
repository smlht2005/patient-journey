import { getSession, isTokenValid } from '@/lib/session/store';
import { refreshAccessToken } from '@/lib/smart/tokenExchange';

/**
 * T2.5 — 帶 token 的 FHIR fetch
 * 
 * 安全加固：
 * - singleton refreshPromise 防止並行請求重複觸發 token refresh（競態條件修復）
 * - 15s request timeout
 * - expires_in fallback（防 undefined → NaN）
 */

// module-level singleton：同一時間只允許一個 refresh 流程
let refreshPromise: Promise<void> | null = null;

async function ensureValidToken(): Promise<void> {
  const session = await getSession();
  if (isTokenValid(session)) return; // 還有效，直接返回

  if (!session.refreshToken || !session.tokenEndpoint) {
    throw new Error('未授權：缺少 access_token，請先完成 SMART launch');
  }

  // 若已有 refresh 進行中，等待同一個 promise 而非重複發起
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const t = await refreshAccessToken({
          tokenEndpoint: session.tokenEndpoint!,
          refreshToken: session.refreshToken!,
          clientId: process.env.SMART_CLIENT_ID!,
        });
        const freshSession = await getSession(); // 重新取 session 避免 stale closure
        freshSession.accessToken = t.access_token;
        freshSession.refreshToken = t.refresh_token ?? freshSession.refreshToken;
        // expires_in fallback：若 undefined 預設 3600s
        freshSession.expiresAt = Date.now() + (t.expires_in ?? 3600) * 1000;
        await freshSession.save();
      } finally {
        refreshPromise = null; // 完成後（含失敗）清除 singleton
      }
    })();
  }

  await refreshPromise;
}

const DEV_NO_AUTH = 'dev-no-auth';

export async function fhirFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await getSession();

  if (session.accessToken === DEV_NO_AUTH) {
    // dev 模式：直接連本機 FHIR（無 OAuth），不附 Authorization header
    if (!session.iss) throw new Error('dev-login 未設定 iss，請重新執行 dev-login');
    const base = session.iss.replace(/\/+$/, '');
    const url = path.startsWith('http') ? path : `${base}/${path.replace(/^\/+/, '')}`;
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), Accept: 'application/fhir+json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  }

  await ensureValidToken();

  if (!session.accessToken || !session.iss) {
    throw new Error('未授權：缺少 access_token，請先完成 SMART launch');
  }

  const base = session.iss.replace(/\/+$/, '');
  const url = path.startsWith('http') ? path : `${base}/${path.replace(/^\/+/, '')}`;

  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${session.accessToken}`,
      Accept: 'application/fhir+json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
}
