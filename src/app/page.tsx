export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center', maxWidth: 520, padding: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Patient Journey</h1>
        <p style={{ color: '#8fb8d6', marginBottom: 24 }}>病人就醫歷程智慧平台 · SMART on FHIR (TW Core) POC</p>
        <a href="/api/auth/launch"
           style={{ display: 'inline-block', background: 'linear-gradient(135deg,#22d3ee,#0e7490)', color: '#050b18', fontWeight: 700, padding: '12px 28px', borderRadius: 10, textDecoration: 'none' }}>
          以 SMART on FHIR 啟動 (Standalone Launch)
        </a>
        <p style={{ color: '#5a7d9c', fontSize: 13, marginTop: 16 }}>
          EHR Launch 由 HIS 帶入 <code>?iss=...&amp;launch=...</code> 呼叫 <code>/api/auth/launch</code>
        </p>
      </div>
    </main>
  );
}
