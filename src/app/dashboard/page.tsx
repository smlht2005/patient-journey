/**
 * T2.6 + ③ Dashboard Page (Server Component)
 * 
 * 1. 從 session 取 patientId
 * 2. 呼叫 /api/patient-summary → PatientSummaryVM
 * 3. 將 data 傳入 PatientJourney 前端元件（Client Component）
 */
import { getSession } from '@/lib/session/store';
import DashboardClient from './DashboardClient';

export default async function Dashboard() {
  const session = await getSession();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const patientId = session.patientId ?? '';

  let summary = null;
  let source = 'mock';

  try {
    const res = await fetch(
      `${baseUrl}/api/patient-summary${patientId ? `?patientId=${patientId}` : ''}`,
      { cache: 'no-store' }
    );
    const json = await res.json();
    summary = json.data;
    source = json.source;
  } catch {
    // fallback handled in DashboardClient with mock
  }

  return <DashboardClient initialSummary={summary} source={source} />;
}
