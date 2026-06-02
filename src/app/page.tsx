const IS_DEV = process.env.NODE_ENV !== 'production';
const DEV_SOURCE = process.env.DEV_FHIR_SOURCE ?? 'twcore';
const DEV_LABEL: Record<string, string> = {
  twcore: 'TW Core Sandbox (hapi.fhir.tw)',
  local:  'Local FHIR Docker (localhost:9090)',
};

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui', background: '#050b18', color: '#e6f4ff' }}>
      <div style={{ textAlign: 'center', maxWidth: 520, padding: 24 }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Patient Journey</h1>
        <p style={{ color: '#8fb8d6', marginBottom: 32 }}>病人就醫歷程智慧平台 · SMART on FHIR (TW Core) POC</p>

        {/* SMART OAuth Launch */}
        <a href="/api/auth/launch"
           style={{ display: 'inline-block', background: 'linear-gradient(135deg,#22d3ee,#0e7490)', color: '#050b18', fontWeight: 700, padding: '12px 28px', borderRadius: 10, textDecoration: 'none', fontSize: 15 }}>
          以 SMART on FHIR 啟動 (Standalone Launch)
        </a>
        <p style={{ color: '#5a7d9c', fontSize: 12, marginTop: 10 }}>
          EHR Launch 由 HIS 帶入 <code>?iss=...&amp;launch=...</code> 呼叫 <code>/api/auth/launch</code>
        </p>

        {/* Dev Mode 快速入口（僅開發環境） */}
        {IS_DEV && (
          <div style={{ marginTop: 36, borderTop: '1px solid #1c3458', paddingTop: 24 }}>
            <p style={{ color: '#5a7d9c', fontSize: 11, marginBottom: 12, letterSpacing: 1 }}>
              DEV MODE
            </p>
            {/* 目前設定的 source */}
            <a href="/api/auth/dev-connect"
               style={{ display: 'inline-block', background: '#0e1c33', border: '1px solid #22d3ee44', color: '#22d3ee', fontWeight: 600, padding: '10px 22px', borderRadius: 8, textDecoration: 'none', fontSize: 13, marginBottom: 8 }}>
              ⚡ Dev 快速登入（{DEV_LABEL[DEV_SOURCE] ?? DEV_SOURCE}）
            </a>
            {/* 切換按鈕 */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
              <a href="/api/auth/dev-connect?source=twcore"
                 style={{ fontSize: 11, color: DEV_SOURCE === 'twcore' ? '#22d3ee' : '#5a7d9c', textDecoration: 'none', padding: '4px 10px', borderRadius: 6, border: `1px solid ${DEV_SOURCE === 'twcore' ? '#22d3ee44' : '#1c3458'}` }}>
                TW Core
              </a>
              <a href="/api/auth/dev-connect?source=local"
                 style={{ fontSize: 11, color: DEV_SOURCE === 'local' ? '#22d3ee' : '#5a7d9c', textDecoration: 'none', padding: '4px 10px', borderRadius: 6, border: `1px solid ${DEV_SOURCE === 'local' ? '#22d3ee44' : '#1c3458'}` }}>
                Local Docker
              </a>
            </div>
            <p style={{ color: '#5a7d9c', fontSize: 11, marginTop: 10 }}>
              切換來源請改 <code>.env.local</code> 的 <code>DEV_FHIR_SOURCE</code>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
