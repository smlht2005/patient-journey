import { NextResponse } from 'next/server';
import { getSession, isTokenValid } from '@/lib/session/store';

// 臨時診斷端點 — 查看當前 session 狀態
// 用完後刪除此檔案
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    hasAccessToken: !!session.accessToken,
    hasPatientId:   !!session.patientId,
    hasRefreshToken: !!session.refreshToken,
    isTokenValid:   isTokenValid(session),
    patientId:      session.patientId ?? '(empty)',
    iss:            session.iss ?? '(empty)',
    expiresAt:      session.expiresAt ? new Date(session.expiresAt).toISOString() : '(empty)',
    tokenEndpoint:  session.tokenEndpoint ?? '(empty)',
    accessTokenPrefix: session.accessToken?.slice(0, 20) ?? '(empty)',
  });
}
