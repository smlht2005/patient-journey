import { getSession, isTokenValid } from '@/lib/session/store';
import { refreshAccessToken } from '@/lib/smart/tokenExchange';

// T2.5 — 帶 token 的 FHIR fetch，token 過期時自動續期
export async function fhirFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await getSession();

  if (!isTokenValid(session) && session.refreshToken && session.tokenEndpoint) {
    const t = await refreshAccessToken({
      tokenEndpoint: session.tokenEndpoint,
      refreshToken: session.refreshToken,
      clientId: process.env.SMART_CLIENT_ID!,
    });
    session.accessToken = t.access_token;
    session.refreshToken = t.refresh_token ?? session.refreshToken;
    session.expiresAt = Date.now() + t.expires_in * 1000;
    await session.save();
  }

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
  });
}
