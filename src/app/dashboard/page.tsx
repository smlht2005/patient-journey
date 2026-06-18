/**
 * Dashboard Page (Server Component)
 *
 * 修正：移除 self-fetch（Server Component 呼叫自身 /api/patient-summary 迴圈）。
 * 改為直接從 FHIR 取資源並呼叫 buildPatientSummary()，
 * 消除 Vercel Serverless cold start 疊加延遲。
 */
export const dynamic = 'force-dynamic';

import { getSession, isTokenValid } from '@/lib/session/store';
import { fhirFetch } from '@/lib/fhir/client';
import { buildPatientSummary } from '@/lib/fhir/mappers';
import { MOCK_SUMMARY } from '@/lib/fhir/mock';
import DashboardClient from './DashboardClient';

async function toResources(res: Response): Promise<any[]> {
  if (!res.ok) return [];
  const b = await res.json();
  return (b.entry ?? []).map((e: any) => e.resource).filter(Boolean);
}

export default async function Dashboard({ searchParams }: { searchParams: { patientId?: string } }) {
  const session = await getSession();

  // 切換病人（Fix B）：沿用現有 session token，只覆寫 patientId，
  // 不再經 dev-login 重建 session（避免把 SMART OAuth token 砍成 dev-no-auth）。
  const switchTo = searchParams.patientId?.trim();
  if (switchTo && switchTo !== session.patientId) {
    session.patientId = switchTo;
    await session.save();
  }

  let patientId = session.patientId ?? '';
  const tokenValid = isTokenValid(session);

  // Standalone Launch 不回傳 patient claim → 自動從 FHIR 取第一筆 Patient
  if (tokenValid && !patientId) {
    try {
      const listRes = await fhirFetch('Patient?_count=1&_sort=-_lastUpdated');
      if (listRes.ok) {
        const bundle = await listRes.json();
        const firstId = bundle.entry?.[0]?.resource?.id as string | undefined;
        if (firstId) {
          patientId = firstId;
          session.patientId = firstId;
          await session.save();
        }
      }
    } catch { /* silently fall through to mock */ }
  }

  const authed = tokenValid && patientId.length > 0;

  let summary = MOCK_SUMMARY;
  let source  = 'mock';

  if (authed) {
    try {
      const patRes = await fhirFetch(`Patient/${patientId}`);
      if (!patRes.ok) throw new Error(`Patient fetch 失敗 ${patRes.status}`);
      const patient = await patRes.json();

      const [obsRes, diagRes, medRes, admRes] = await Promise.all([
        fhirFetch(`Observation?patient=${patientId}&_count=200&_sort=-date`),
        fhirFetch(`DiagnosticReport?patient=${patientId}&_count=50&_sort=-date`),
        fhirFetch(`MedicationRequest?patient=${patientId}&status=active&_count=50`),
        fhirFetch(`MedicationAdministration?patient=${patientId}&_count=30&_sort=-effective-time`),
      ]);

      const [observations, diagnostics, medications, administrations] = await Promise.all([
        toResources(obsRes), toResources(diagRes),
        toResources(medRes), toResources(admRes),
      ]);

      summary = buildPatientSummary(patient, [...observations, ...diagnostics, ...medications, ...administrations], session.practitionerName);
      source  = 'fhir';
    } catch (err) {
      console.error('[dashboard]', err);
      source = 'mock-fallback';
    }
  }

  const iss              = session.iss ?? '';
  const isDev            = session.accessToken === 'dev-no-auth';
  const practitionerName = session.practitionerName;
  // 切換病人（Fix A）：僅限 dev-no-auth session（本機 HAPI / 開放 TW Core sandbox）。
  // SMART OAuth 模式下 token 綁定特定病人 context，切換到別的病人會被 scope 擋下並 fallback 成 mock，故隱藏。
  const canSwitchPatient = process.env.NODE_ENV !== 'production' && isDev;
  return <DashboardClient initialSummary={summary} source={source} iss={iss} isDev={isDev} practitionerName={practitionerName} canSwitchPatient={canSwitchPatient} />;
}
