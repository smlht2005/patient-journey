import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session/store';

// 僅限本機開發使用，繞過 SMART OAuth 直接設定 session
// 生產環境（NODE_ENV=production）回傳 404，不暴露此端點
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const fhirBase = url.searchParams.get('fhirBase') ?? 'http://localhost:9090';
  const patientId = url.searchParams.get('patientId') ?? '';

  if (!patientId) {
    return NextResponse.json(
      { error: 'patientId 為必填，請先執行 npm run seed:fhir 取得 Patient ID' },
      { status: 400 },
    );
  }

  const session = await getSession();
  session.iss = fhirBase;
  session.patientId = patientId;
  session.accessToken = 'dev-no-auth';
  session.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 小時
  session.tokenEndpoint = '';
  session.state = undefined;
  session.codeVerifier = undefined;
  await session.save();

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `${url.protocol}//${url.host}`;
  return NextResponse.redirect(new URL('/dashboard', baseUrl));
}
