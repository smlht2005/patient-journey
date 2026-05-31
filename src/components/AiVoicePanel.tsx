'use client';
/**
 * AiVoicePanel — ⑤ AI 服務整合面板
 * 
 * 功能：
 * 1. 語音錄音（Web Speech API，不需 Whisper API key）
 * 2. 文字輸入醫囑 → 呼叫 /api/ai/voice-order → FHIR 草稿
 * 3. AI 對話 → 呼叫 /api/ai/chat（帶病人 context）
 * 4. AI 智慧摘要 → 呼叫 /api/ai/summarize
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, Sparkles, CheckCircle2, AlertTriangle, X, Brain, FileText } from 'lucide-react';
import { PatientSummaryVM } from '@/types/viewmodels';
import { ChatMessage, FhirMedicationRequest } from '@/types/ai';

const C = {
  bg0: '#050b18', bg1: '#0a1424', bg2: '#0e1c33', bg3: '#13294b',
  border: '#1c3458', borderLit: '#2a4d7a',
  t1: '#e6f4ff', t2: '#8fb8d6', t3: '#5a7d9c',
  cyan: '#22d3ee', cyanDim: '#0e7490',
  red: '#f43f5e', amber: '#f59e0b', green: '#22c55e', violet: '#a78bfa',
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

interface Props {
  summary: PatientSummaryVM;
  onNewAlert?: (title: string, body: string, level: 'danger' | 'warning') => void;
}

export default function AiVoicePanel({ summary, onNewAlert }: Props) {
  const [tab, setTab] = useState<'voice' | 'chat' | 'summary'>('voice');

  // Voice order state
  const [orderText, setOrderText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [fhirDraft, setFhirDraft] = useState<FhirMedicationRequest | null>(null);
  const [signed, setSigned] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderWarnings, setOrderWarnings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);

  // Chat state
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([
    { role: 'assistant', content: `Patient Journey AI 助理已就緒。目前照護：**${summary.patient.name}**，${summary.alerts.length} 項警示啟用中。有任何臨床問題歡迎詢問。` },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Summary state
  const [summaryResult, setSummaryResult] = useState<{ summary: string; keyFindings: string[]; followUpItems: string[]; riskLevel: string } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryMode, setSummaryMode] = useState<'handoff' | 'rounds' | 'brief'>('handoff');

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMsgs]);

  // ── 語音辨識 (Web Speech API) ──────────────────────────────────────────
  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) { alert('此瀏覽器不支援 Web Speech API，請改用 Chrome。'); return; }
    const rec = new SR();
    rec.lang = 'zh-TW';
    rec.interimResults = false;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      setOrderText(e.results[0][0].transcript);
      setIsRecording(false);
    };
    rec.onerror = () => setIsRecording(false);
    rec.onend = () => setIsRecording(false);
    recogRef.current = rec;
    rec.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    recogRef.current?.stop();
    setIsRecording(false);
  }, []);

  // ── 語音 / 文字 → FHIR ────────────────────────────────────────────────
  const generateFhir = async () => {
    if (!orderText.trim()) return;
    setOrderLoading(true);
    setFhirDraft(null);
    setOrderWarnings([]);
    setSigned(false);

    try {
      const res = await fetch('/api/ai/voice-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: orderText,
          patientId: summary.patient.mrn,
          patientName: summary.patient.name,
        }),
      });
      const data = await res.json();
      if (data.success && data.fhirDraft) {
        setFhirDraft(data.fhirDraft);
        setConfidence(data.confidence);
        setOrderWarnings(data.warnings ?? []);
        // 事件驅動：將 STAT 醫囑推至警示
        if (data.fhirDraft.priority === 'stat') {
          onNewAlert?.('語音醫囑 STAT 開立', `${data.fhirDraft.medicationCodeableConcept.text}`, 'warning');
        }
      } else {
        setOrderWarnings([data.error ?? '解析失敗，請重新輸入']);
      }
    } catch {
      setOrderWarnings(['網路錯誤，請確認 API key 是否設定']);
    } finally {
      setOrderLoading(false);
    }
  };

  // ── AI 對話 ────────────────────────────────────────────────────────────
  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput };
    setChatMsgs(p => [...p, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMsgs, userMsg],
          patientContext: {
            patientId: summary.patient.mrn,
            patientName: summary.patient.name,
            activeAlerts: summary.alerts.map(a => a.title),
            keyLabs: summary.observations.map(o => `${o.display}: ${o.value} ${o.unit}`).join('、'),
          },
        }),
      });
      const data = await res.json();
      setChatMsgs(p => [...p, { role: 'assistant', content: data.reply ?? '（無回應）' }]);
    } catch {
      setChatMsgs(p => [...p, { role: 'assistant', content: '⚠️ API 連線失敗，請確認 ANTHROPIC_API_KEY。' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── AI 智慧摘要 ────────────────────────────────────────────────────────
  const generateSummary = async () => {
    setSummaryLoading(true);
    setSummaryResult(null);
    try {
      const res = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: summary.patient.mrn,
          patientName: summary.patient.name,
          observations: summary.observations,
          medications: summary.medications,
          alerts: summary.alerts,
          admitDate: summary.patient.admit,
          mode: summaryMode,
        }),
      });
      const data = await res.json();
      setSummaryResult(data);
    } catch {
      setSummaryResult({ summary: '⚠️ 摘要產生失敗，請確認 ANTHROPIC_API_KEY。', keyFindings: [], followUpItems: [], riskLevel: 'low' });
    } finally {
      setSummaryLoading(false);
    }
  };

  const tabStyle = (t: string) => ({
    cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
    padding: '6px 14px', borderRadius: 8, border: 'none',
    background: tab === t ? C.cyan : C.bg2,
    color: tab === t ? C.bg0 : C.t2,
  });

  const riskColor = (r: string) => r === 'high' ? C.red : r === 'moderate' ? C.amber : C.green;

  return (
    <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
        <Sparkles size={15} color={C.cyan} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.t1, flex: 1 }}>AI 服務</span>
        <button style={tabStyle('voice')} onClick={() => setTab('voice')}><Mic size={12} style={{ display: 'inline', marginRight: 4 }} />語音醫囑</button>
        <button style={tabStyle('chat')} onClick={() => setTab('chat')}><Brain size={12} style={{ display: 'inline', marginRight: 4 }} />對話</button>
        <button style={tabStyle('summary')} onClick={() => setTab('summary')}><FileText size={12} style={{ display: 'inline', marginRight: 4 }} />摘要</button>
      </div>

      <div style={{ padding: 12 }}>
        {/* ── Voice Order Tab ── */}
        {tab === 'voice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11.5, color: C.t2 }}>輸入文字或按麥克風錄音，AI 解析為 FHIR TW Core 醫囑草稿。</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea
                value={orderText}
                onChange={e => setOrderText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generateFhir()}
                placeholder="例：病人有體液滯留，開立 Lasix 40mg IV STAT&#10;&#10;Ctrl+Enter 送出"
                rows={3}
                style={{ flex: 1, resize: 'none', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.t1, fontSize: 12, padding: 8, outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={isRecording ? stopRecording : startRecording}
                style={{ width: 44, background: isRecording ? C.red : C.bg3, border: `1px solid ${isRecording ? C.red : C.border}`, borderRadius: 8, cursor: 'pointer', color: isRecording ? '#fff' : C.t2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2, fontSize: 9 }}
              >
                {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                {isRecording ? '停止' : '錄音'}
              </button>
            </div>
            {isRecording && <div style={{ fontSize: 11, color: C.red, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, animation: 'pulse 1s infinite' }} />語音辨識中…（請說話）</div>}

            <button onClick={generateFhir} disabled={orderLoading || !orderText.trim()}
              style={{ cursor: 'pointer', background: orderLoading || !orderText.trim() ? C.bg3 : `linear-gradient(135deg,${C.cyan},${C.cyanDim})`, color: orderLoading ? C.t3 : C.bg0, border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Sparkles size={14} />{orderLoading ? 'AI 解析中…' : '生成 FHIR 草稿 (Claude API)'}
            </button>

            {orderWarnings.length > 0 && (
              <div style={{ background: `${C.amber}18`, border: `1px solid ${C.amber}55`, borderRadius: 8, padding: '8px 12px' }}>
                {orderWarnings.map((w, i) => <div key={i} style={{ fontSize: 11.5, color: C.amber, display: 'flex', gap: 6 }}><AlertTriangle size={12} style={{ marginTop: 1, flexShrink: 0 }} />{w}</div>)}
              </div>
            )}

            {fhirDraft && (
              <div style={{ background: C.bg0, border: `1px solid ${C.borderLit}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.cyan, fontFamily: 'monospace' }}>MedicationRequest · FHIR TW Core</span>
                  {confidence !== null && (
                    <span style={{ fontSize: 10.5, color: confidence > 0.8 ? C.green : C.amber, fontFamily: 'monospace' }}>信心度 {Math.round(confidence * 100)}%</span>
                  )}
                </div>
                <pre style={{ margin: 0, padding: 10, fontSize: 10.5, color: C.t2, fontFamily: 'monospace', maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(fhirDraft, null, 2)}
                </pre>
                <div style={{ padding: 10, borderTop: `1px solid ${C.border}` }}>
                  {signed
                    ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: C.green, fontWeight: 700, fontSize: 13 }}><CheckCircle2 size={16} />已簽署並開立</div>
                    : <button onClick={() => setSigned(true)} style={{ width: '100%', cursor: 'pointer', background: C.green, color: C.bg0, border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 700 }}>確認簽署並開立</button>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Chat Tab ── */}
        {tab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div ref={chatScrollRef} style={{ height: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 2 }}>
              {chatMsgs.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
                  <div style={{ fontSize: 12, lineHeight: 1.6, padding: '8px 12px', borderRadius: 10, background: m.role === 'user' ? C.cyanDim : C.bg2, border: `1px solid ${m.role === 'user' ? C.cyan + '55' : C.border}`, color: m.role === 'user' ? '#eafcff' : C.t2, whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ alignSelf: 'flex-start' }}>
                  <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 10, background: C.bg2, border: `1px solid ${C.border}`, color: C.t3 }}>AI 思考中…</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                disabled={chatLoading}
                placeholder="輸入臨床問題…（Enter 送出）"
                style={{ flex: 1, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.t1, fontSize: 12, padding: '8px 10px', outline: 'none' }} />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                style={{ cursor: 'pointer', background: C.bg3, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.cyan, width: 40, display: 'grid', placeItems: 'center' }}>
                <Send size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── Summary Tab ── */}
        {tab === 'summary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['handoff', 'rounds', 'brief'] as const).map(m => (
                <button key={m} onClick={() => setSummaryMode(m)}
                  style={{ cursor: 'pointer', flex: 1, padding: '6px 0', borderRadius: 8, border: `1px solid ${summaryMode === m ? C.cyan : C.border}`, background: summaryMode === m ? 'rgba(34,211,238,.12)' : C.bg2, color: summaryMode === m ? C.cyan : C.t3, fontSize: 12, fontWeight: 600 }}>
                  {m === 'handoff' ? '交班' : m === 'rounds' ? '查房' : '快速'}
                </button>
              ))}
            </div>
            <button onClick={generateSummary} disabled={summaryLoading}
              style={{ cursor: 'pointer', background: summaryLoading ? C.bg3 : `linear-gradient(135deg,${C.violet},#7c3aed)`, color: summaryLoading ? C.t3 : '#fff', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Brain size={14} />{summaryLoading ? 'AI 生成摘要中…' : '產生 AI 智慧摘要'}
            </button>

            {summaryResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>AI 摘要</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: `${riskColor(summaryResult.riskLevel)}22`, color: riskColor(summaryResult.riskLevel), border: `1px solid ${riskColor(summaryResult.riskLevel)}55` }}>
                    風險：{summaryResult.riskLevel === 'high' ? '高' : summaryResult.riskLevel === 'moderate' ? '中' : '低'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.7, background: C.bg0, padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, whiteSpace: 'pre-wrap' }}>
                  {summaryResult.summary}
                </div>
                {summaryResult.keyFindings.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, marginBottom: 4 }}>關鍵發現</div>
                    {summaryResult.keyFindings.map((f, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: C.t2, display: 'flex', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: C.amber }}>▶</span>{f}
                      </div>
                    ))}
                  </div>
                )}
                {summaryResult.followUpItems.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: C.t1, marginBottom: 4 }}>追蹤事項</div>
                    {summaryResult.followUpItems.map((f, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: C.t2, display: 'flex', gap: 6, marginBottom: 3 }}>
                        <CheckCircle2 size={12} color={C.green} style={{ marginTop: 1, flexShrink: 0 }} />{f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-thumb{background:#1c3458;border-radius:4px}
      `}</style>
    </div>
  );
}
