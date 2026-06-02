import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session/store';

// Dev 模式快速連線端點（生產環境回傳 404）
// 讀取 DEV_FHIR_SOURCE env，自動查詢 Patient，設 session，跳轉 /dashboard
// GET /api/auth/dev-connect?source=twcore|local
export const dynamic = 'force-dynamic';

const FHIR_SOURCES: Record<string, string> = {
  twcore: 'https://hapi.fhir.tw/fhir',
  local:  '', // 由 DEV_FHIR_LOCAL 動態填入
};

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  // query param 優先，否則讀 env，預設 twcore
  const url    = new URL(req.url);
  const source = url.searchParams.get('source') ?? process.env.DEV_FHIR_SOURCE ?? 'twcore';

  FHIR_SOURCES.local = process.env.DEV_FHIR_LOCAL ?? 'http://localhost:9090/fhir';
  const fhirBase = FHIR_SOURCES[source] ?? FHIR_SOURCES.twcore;

  // 自動查詢第一筆 Patient
  let patientId: string | undefined;
  try {
    const res = await fetch(`${fhirBase}/Patient?_count=1`, {
      headers: { Accept: 'application/fhir+json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const bundle = await res.json();
      patientId = bundle.entry?.[0]?.resource?.id;
    }
  } catch (e) {
    console.error('[dev-connect] Patient query 失敗:', e);
  }

  if (!patientId) {
    return NextResponse.json(
      { error: `無法從 ${fhirBase} 取得 Patient，請確認 FHIR server 正常運作` },
      { status: 502 },
    );
  }

  // 寫入 session
  const session = await getSession();
  session.iss          = fhirBase;
  session.patientId    = patientId;
  session.accessToken  = 'dev-no-auth';
  session.expiresAt    = Date.now() + 24 * 60 * 60 * 1000;
  session.tokenEndpoint = '';
  session.state        = undefined;
  session.codeVerifier = undefined;
  await session.save();

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `${url.protocol}//${url.host}`;
  return NextResponse.redirect(new URL('/dashboard', baseUrl));
}
