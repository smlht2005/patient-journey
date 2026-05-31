/**
 * Dashboard Page (Server Component)
 *
 * 修正：移除 self-fetch（Server Component 呼叫自身 /api/patient-summary 迴圈）。
 * 改為直接從 FHIR 取資源並呼叫 buildPatientSummary()，
 * 消除 Vercel Serverless cold start 疊加延遲。
 */
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

export default async function Dashboard() {
  const session = await getSession();
  const patientId = session.patientId ?? '';
  const authed = isTokenValid(session) && patientId.length > 0;

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

      summary = buildPatientSummary(patient, [...observations, ...diagnostics, ...medications, ...administrations]);
      source  = 'fhir';
    } catch (err) {
      console.error('[dashboard]', err);
      source = 'mock-fallback';
    }
  }

  return <DashboardClient initialSummary={summary} source={source} />;
}
