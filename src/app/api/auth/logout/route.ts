import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session/store';

async function doLogout(redirectTo?: string) {
  const session = await getSession();
  session.destroy();
  if (redirectTo) {
    const res = NextResponse.redirect(redirectTo);
    return res;
  }
  return NextResponse.json({ ok: true });
}

// POST /api/auth/logout — API 呼叫登出
export async function POST() {
  return doLogout();
}

// GET /api/auth/logout — 瀏覽器直接導覽登出，redirect 回首頁
export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `${(req.headers as Headers).get('x-forwarded-proto') ?? url.protocol.replace(':', '')}://${(req.headers as Headers).get('x-forwarded-host') ?? url.host}`;
  return doLogout(`${baseUrl}/`);
}
