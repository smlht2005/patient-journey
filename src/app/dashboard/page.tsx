import { getSession, isTokenValid } from '@/lib/session/store';

// T2.6 — 授權後落點。實際儀表板 UI 由 PatientJourney 元件接 /api/fhir/* 取代 mock。
export default async function Dashboard() {
  const session = await getSession();
  const authed = isTokenValid(session);
  return (
    <main style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 22 }}>Dashboard</h1>
      <p style={{ color: '#8fb8d6', marginTop: 8 }}>
        授權狀態：{authed ? '✅ 已取得 access_token' : '⚠️ 尚未授權 (將以 mock fallback 渲染)'}
      </p>
      <p style={{ color: '#5a7d9c', marginTop: 8 }}>
        Patient context：{session.patientId ?? '—'}
      </p>
      <pre style={{ marginTop: 16, background: '#0a1424', padding: 16, borderRadius: 8, fontSize: 13 }}>
{`下一步：
1. 將 PatientJourney.jsx 元件移入 src/components/，改為呼叫 /api/fhir/Patient/\${id}
2. 完成 /tasks ③ FHIR 映射（mappers.ts），把 Observation/MedicationRequest 轉 ViewModel
3. CDS Hooks 安全引擎 (order-select / order-sign) 接入`}
      </pre>
      <p style={{ marginTop: 24 }}>
        測試 FHIR Proxy：<a href="/api/fhir/Patient" style={{ color: '#22d3ee' }}>/api/fhir/Patient</a>
      </p>
    </main>
  );
}
