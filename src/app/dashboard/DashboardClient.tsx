'use client';
/**
 * Dashboard Client Component
 * 接收 Server Component 傳來的 PatientSummaryVM，
 * 渲染完整 Patient Journey 儀表板。
 * 若 summary 為 null 則以 mock fallback 渲染。
 */
import { PatientSummaryVM } from '@/types/viewmodels';
import { MOCK_SUMMARY } from '@/lib/fhir/mock';
import PatientJourneyDashboard from '@/components/PatientJourneyDashboard';

interface Props {
  initialSummary: PatientSummaryVM | null;
  source: string;
  iss: string;
  isDev: boolean;
}

export default function DashboardClient({ initialSummary, source, iss, isDev }: Props) {
  const summary = initialSummary ?? MOCK_SUMMARY;
  return (
    <div>
      {source === 'mock' || source === 'mock-fallback' ? (
        <div style={{ background: '#0e1c33', borderBottom: '1px solid #1c3458', padding: '6px 16px', fontSize: 11.5, color: '#f59e0b', display: 'flex', gap: 6, alignItems: 'center' }}>
          ⚠️ 展示模式（Mock 資料）— 完成 SMART on FHIR 授權後將自動切換為真實 FHIR 資料
          <a href="/api/auth/launch" style={{ color: '#22d3ee', marginLeft: 8 }}>立即授權 →</a>
        </div>
      ) : (
        <div style={{ background: '#0a1424', borderBottom: '1px solid #1c3458', padding: '6px 16px', fontSize: 11.5, color: '#22c55e' }}>
          ✅ 資料來源：HAPI FHIR (TW Core){isDev ? ` — ${iss}` : ''} — 即時同步
        </div>
      )}
      <PatientJourneyDashboard summary={summary} iss={iss} isDev={isDev} />
    </div>
  );
}
