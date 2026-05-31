import { TokenResponse } from '@/types/smart';

// T2.3 — 以 authorization code + PKCE verifier 交換 token
export async function exchangeCodeForToken(params: {
  tokenEndpoint: string;
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });
  const res = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '(無法讀取錯誤內容)');
    throw new Error(`token 交換失敗：${res.status} — ${errBody.slice(0, 300)}`);
  }
  const token = (await res.json()) as TokenResponse;
  // expires_in fallback：SMART server 可能省略此欄位
  token.expires_in = token.expires_in ?? 3600;
  return token;
}

// T2.4 — 以 refresh_token 續期
export async function refreshAccessToken(params: {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
  const res = await fetch(params.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // 修正：記錄完整錯誤 body，方便除錯
    const errBody = await res.text().catch(() => '(無法讀取錯誤內容)');
    throw new Error(`refresh_token 續期失敗：${res.status} — ${errBody.slice(0, 300)}`);
  }
  const token = (await res.json()) as TokenResponse;
  token.expires_in = token.expires_in ?? 3600;
  return token;
}
