import { getIronSession, IronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { SmartSession } from '@/types/smart';

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? 'dev_only_secret_change_me_min_32_chars__',
  cookieName: 'pj_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  },
};

// 取得目前請求的伺服端 session（HttpOnly cookie 只放 session id/加密內容）
export async function getSession(): Promise<IronSession<SmartSession>> {
  return getIronSession<SmartSession>(cookies(), sessionOptions);
}

// T2.4 — token 是否仍有效（保留 30s buffer）
export function isTokenValid(s: SmartSession): boolean {
  return Boolean(s.accessToken && s.expiresAt && Date.now() < s.expiresAt - 30_000);
}
