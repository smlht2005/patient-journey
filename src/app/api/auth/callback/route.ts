import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/smart/tokenExchange';
import { getSession } from '@/lib/session/store';

// T2.3 — Authorization callback：驗 state、換 token、存 session
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const session = await getSession();

  if (!code || !state || state !== session.state) {
    return NextResponse.json({ error: 'state 驗證失敗或缺少授權碼 (CSRF 防護)' }, { status: 400 });
  }
  if (!session.tokenEndpoint || !session.codeVerifier) {
    return NextResponse.json({ error: 'session 遺失 launch 狀態' }, { status: 400 });
  }

  const token = await exchangeCodeForToken({
    tokenEndpoint: session.tokenEndpoint,
    code,
    redirectUri: process.env.SMART_REDIRECT_URI!,
    clientId: process.env.SMART_CLIENT_ID!,
    codeVerifier: session.codeVerifier,
  });

  session.accessToken = token.access_token;
  session.refreshToken = token.refresh_token;
  session.patientId = token.patient;
  session.expiresAt = Date.now() + token.expires_in * 1000;
  session.codeVerifier = undefined; // 用後即清
  session.state = undefined;
  await session.save();

  return NextResponse.redirect(new URL('/dashboard', req.url));
}
