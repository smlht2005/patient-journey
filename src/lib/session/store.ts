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
    // 最長 8 小時（配合典型臨床班次）
    maxAge: 8 * 60 * 60,
  },
};

export async function getSession(): Promise<IronSession<SmartSession>> {
  // 守衛在 request time 執行，避免 build time throw 導致 Next.js 收集頁面資料失敗
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error(
      '[Patient Journey] SESSION_SECRET 未設定。' +
      '請在環境變數中設定至少 32 字元的隨機字串。',
    );
  }
  return getIronSession<SmartSession>(cookies(), sessionOptions);
}

// T2.4 — token 是否仍有效（保留 60s buffer，比原本的 30s 更保守）
export function isTokenValid(s: SmartSession): boolean {
  return Boolean(s.accessToken && s.expiresAt && Date.now() < s.expiresAt - 60_000);
}
