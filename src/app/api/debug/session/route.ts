import { NextResponse } from 'next/server';
import { getSession, isTokenValid } from '@/lib/session/store';

export const dynamic = 'force-dynamic';

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1];
    if (!part) return null;
    const padded = part + '='.repeat((4 - part.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch { return null; }
}

export async function GET() {
  const session = await getSession();
  const jwtPayload = session.accessToken ? decodeJwtPayload(session.accessToken) : null;

  // 嘗試直接用 access token 查 Patient
  let fhirPatientQuery: unknown = 'not_attempted';
  if (session.accessToken && session.iss) {
    try {
      const base = session.iss.replace(/\/+$/, '');
      const res = await fetch(`${base}/Patient?_count=3`, {
        headers: {
          Accept: 'application/fhir+json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        signal: AbortSignal.timeout(8_000),
      });
      const data = await res.json();
      fhirPatientQuery = {
        status: res.status,
        total: data.total,
        entries: data.entry?.map((e: any) => ({ id: e.resource?.id, name: e.resource?.name?.[0]?.text })),
      };
    } catch (e: unknown) {
      fhirPatientQuery = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json({
    hasAccessToken:    !!session.accessToken,
    hasPatientId:      !!session.patientId,
    hasRefreshToken:   !!session.refreshToken,
    isTokenValid:      isTokenValid(session),
    patientId:         session.patientId ?? '(empty)',
    iss:               session.iss ?? '(empty)',
    expiresAt:         session.expiresAt ? new Date(session.expiresAt).toISOString() : '(empty)',
    jwtClaims:         jwtPayload,
    fhirPatientQuery,
  });
}
