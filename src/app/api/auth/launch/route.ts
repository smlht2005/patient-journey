import { NextRequest, NextResponse } from 'next/server';
import { discoverSmartConfig, SmartValidationError } from '@/lib/smart/discovery';
import { createPkce } from '@/lib/smart/pkce';
import { getSession } from '@/lib/session/store';

// T2.2 — EHR Launch 與 Standalone Launch 入口
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const iss = url.searchParams.get('iss') ?? process.env.FHIR_ISS!;
  const launch = url.searchParams.get('launch') ?? undefined; // EHR launch 時帶入

  let cfg;
  try {
    cfg = await discoverSmartConfig(iss);
  } catch (err) {
    if (err instanceof SmartValidationError) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    // 網路逾時、DNS 失敗、上游 5xx — 不洩漏內部細節
    console.error('[launch] SMART discovery 失敗:', err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { error: 'SMART 服務暫時無法連線，請稍後再試' },
      { status: isTimeout ? 504 : 503 },
    );
  }

  const { codeVerifier, codeChallenge, state } = createPkce();

  const session = await getSession();
  session.iss = iss;
  session.authorizationEndpoint = cfg.authorization_endpoint;
  session.tokenEndpoint = cfg.token_endpoint;
  session.codeVerifier = codeVerifier;
  session.state = state;
  await session.save();

  const authUrl = new URL(cfg.authorization_endpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', process.env.SMART_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', process.env.SMART_REDIRECT_URI!);
  authUrl.searchParams.set('scope', process.env.SMART_SCOPES!);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('aud', iss);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  if (launch) authUrl.searchParams.set('launch', launch);

  return NextResponse.redirect(authUrl.toString());
}
