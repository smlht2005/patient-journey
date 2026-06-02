import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/smart/tokenExchange';
import { getSession } from '@/lib/session/store';

// T2.3 — Authorization callback：驗 state、換 token、存 session
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const oauthError = url.searchParams.get('error');
  const oauthErrorDesc = url.searchParams.get('error_description');

  // OAuth 2.0 error response（授權伺服器拒絕）— 先於 CSRF 檢查
  if (oauthError) {
    const detail = oauthErrorDesc ? decodeURIComponent(oauthErrorDesc) : oauthError;
    return NextResponse.json(
      { error: `授權失敗：${detail}` },
      { status: 400 },
    );
  }

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

  session.accessToken  = token.access_token;
  session.refreshToken = token.refresh_token;
  session.expiresAt    = Date.now() + token.expires_in * 1000;
  session.codeVerifier = undefined;
  session.state        = undefined;

  // Standalone Launch 不回傳 patient claim → 立即從 FHIR 查第一筆 Patient
  let patientId = token.patient;
  if (!patientId && session.iss) {
    try {
      const base = session.iss.replace(/\/+$/, '');
      const ptRes = await fetch(`${base}/Patient?_count=1`, {
        headers: {
          Accept:        'application/fhir+json',
          Authorization: `Bearer ${token.access_token}`,
        },
        signal: AbortSignal.timeout(6_000),
      });
      if (ptRes.ok) {
        const bundle = await ptRes.json();
        patientId = bundle.entry?.[0]?.resource?.id;
      }
    } catch (e) {
      console.error('[callback] patient auto-discover 失敗:', e);
    }
  }
  session.patientId = patientId;
  await session.save();

  // 使用 NEXT_PUBLIC_BASE_URL 避免反向代理（Zeabur）將 req.url 解析為內部 localhost
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`;
  return NextResponse.redirect(new URL('/dashboard', baseUrl));
}
