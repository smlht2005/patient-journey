'use client';
/**
 * PatientJourneyDashboard — ③ 接 ViewModel 版
 * 接收 PatientSummaryVM props，不再使用內部 hardcoded mock。
 * 原 PatientJourney.jsx 保留作為靜態 POC 展示。
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ComposedChart, Area, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import {
  Activity, AlertTriangle, Pill, FileText, Image as ImageIcon, Search,
  User, Mic, Send, X, CheckCircle2, Clock, ShieldAlert, Brain,
  Stethoscope, ChevronRight, Sparkles, Radio,
  Hash, BedDouble, CalendarDays, ArrowRightLeft, LogOut,
} from 'lucide-react';
import { PatientSummaryVM, AlertVM } from '@/types/viewmodels';

interface DashboardProps {
  summary: PatientSummaryVM;
  iss?: string;
  isDev?: boolean;
  practitionerName?: string;
}

const C = {
  bg0: '#050b18', bg1: '#0a1424', bg2: '#0e1c33', bg3: '#13294b',
  border: '#1c3458', borderLit: '#2a4d7a',
  t1: '#e6f4ff', t2: '#8fb8d6', t3: '#5a7d9c',
  cyan: '#22d3ee', cyanDim: '#0e7490',
  red: '#f43f5e', amber: '#f59e0b', green: '#22c55e', violet: '#a78bfa', blue: '#60a5fa',
};

const EFFICACY_MOCK = [
  { m: 'Jun', HbA1c: 8.9, GlucoseAC: 212 },
  { m: 'Jul', HbA1c: 8.6, GlucoseAC: 196 },
  { m: 'Aug', HbA1c: 8.2, GlucoseAC: 184 },
  { m: 'Sep', HbA1c: 7.9, GlucoseAC: 171 },
  { m: 'Oct', HbA1c: 7.6, GlucoseAC: 160 },
  { m: 'Nov', HbA1c: 7.4, GlucoseAC: 149 },
  { m: 'Dec', HbA1c: 7.3, GlucoseAC: 140 },
];

const AI_SEED = [
  { role: 'sys', text: 'Patient Journey loaded via /api/patient-summary.' },
  { role: 'ai', text: 'AI 智慧摘要｜主要診斷：第 2 型糖尿病合併高血壓、高血脂。追蹤重點：HbA1c 目標 <7.0%、K+（Lisinopril 劑量調整前確認）。' },
];

function Card({ title, icon, right, children, style }: any) {
  return (
    <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
          {icon}
          <span style={{ fontSize: 13, fontWeight: 600, color: C.t1, flex: 1 }}>{title}</span>
          {right}
        </div>
      )}
      <div style={{ padding: 12, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

export default function PatientJourneyDashboard({ summary, iss = '', isDev = false, practitionerName }: DashboardProps) {
  const { patient, vitals, medications, journey, adherence, radar, alerts: seedAlerts } = summary;
  const [selectedDrug, setSelectedDrug] = useState(medications[0]?.id ?? '');
  const [alerts, setAlerts] = useState<AlertVM[]>(seedAlerts);
  const [expanded, setExpanded] = useState(journey[0]?.id ?? '');
  const [aiMsgs, setAiMsgs] = useState(AI_SEED);
  const [orderText, setOrderText] = useState('');
  const [fhir, setFhir] = useState<any>(null);
  const [signed, setSigned] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [aiInput, setAiInput] = useState('');
  const [switchId, setSwitchId] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [aiMsgs]);

  const scanOrder = (txt: string) => {
    const t = txt.toLowerCase();
    if ((t.includes('warfarin') || t.includes('可邁丁')) && (t.includes('aspirin') || t.includes('阿斯匹靈'))) {
      if (!alerts.find((a) => a.id === 'live')) {
        setAlerts((p) => [{ id: 'live', level: 'danger', title: '即時攔截：Warfarin + Aspirin', body: '輸入醫囑觸發嚴重交互作用，出血風險升高。', tag: 'Live-Intercept' }, ...p]);
        setFlash('已即時攔截 Warfarin + Aspirin 高風險組合');
        setTimeout(() => setFlash(null), 2600);
      }
    }
  };

  const buildFhir = () => {
    const txt = orderText || '病人有體液滯留，開立 Lasix 40mg IV STAT';
    const isLasix = /lasix|furosemide|利尿/i.test(txt);
    setFhir({
      resourceType: 'MedicationRequest', status: 'draft', intent: 'order',
      priority: /stat|立即/i.test(txt) ? 'stat' : 'routine',
      medicationCodeableConcept: { text: isLasix ? 'Furosemide (Lasix) 40 mg' : txt },
      subject: { reference: `Patient/${patient.mrn}`, display: patient.name },
      dosageInstruction: [{ text: isLasix ? '40 mg IV Push, STAT' : txt }],
      meta: { profile: ['https://twcore.mohw.gov.tw/ig/twcore/StructureDefinition/MedicationRequest-twcore'] },
    });
    setSigned(false);
  };

  const sendAi = (text: string) => {
    if (!text.trim()) return;
    setAiMsgs((p) => [...p, { role: 'user', text }]);
    setTimeout(() => {
      let reply = '已記錄。';
      if (/lisinopril|血鉀|k\+/i.test(text)) reply = '建議增加 Lisinopril 前先確認 K+，ACEI 可能造成高血鉀。';
      else if (/hba1c|血糖/i.test(text)) reply = '近半年 HbA1c 7.3%，與 Metformin 起始期吻合，仍未達 <7.0% 目標。';
      else if (/警示|alert/i.test(text)) reply = `目前 ${alerts.filter(a => a.level === 'danger').length} 嚴重 / ${alerts.filter(a => a.level === 'warning').length} 警告。`;
      setAiMsgs((p) => [...p, { role: 'ai', text: reply }]);
    }, 600);
  };

  const flagColor = (f: string) => f === 'danger' ? C.red : f === 'warning' ? C.amber : f === 'normal' ? C.green : C.cyan;

  return (
    <div style={{ background: C.bg0, minHeight: '100vh', color: C.t1, fontFamily: "'IBM Plex Sans','Noto Sans TC',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ height: 54, display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', borderBottom: `1px solid ${C.border}`, background: 'rgba(10,20,36,.85)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
          <Activity size={20} color={C.cyan} />
          <span>Patient Journey</span>
          <span style={{ fontSize: 10, color: C.cyan, border: `1px solid ${C.cyanDim}`, borderRadius: 6, padding: '1px 6px', fontFamily: 'monospace' }}>FHIR TW Core</span>
        </div>
        <div style={{ flex: 1, maxWidth: 460, display: 'flex', alignItems: 'center', gap: 8, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 12px' }}>
          <Search size={15} color={C.t3} />
          <input placeholder="搜尋病歷 / 關鍵字…" style={{ background: 'transparent', border: 'none', outline: 'none', color: C.t1, fontSize: 13, width: '100%' }} />
        </div>
        <div style={{ fontSize: 12, color: C.t2, display: 'flex', alignItems: 'center', gap: 5 }}><Radio size={13} color={C.green} />SMART on FHIR</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 10px 4px 6px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg,${C.cyan},${C.violet})`, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: C.bg0 }}>
            {(practitionerName ?? 'Dr. tmhtc')[0].toUpperCase()}
          </div>
          <span style={{ fontSize: 12 }}>{practitionerName ?? 'Dr. tmhtc'}</span>
        </div>
        <a href="/api/auth/logout" title="登出"
           style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, background: C.bg2, border: `1px solid ${C.border}`, color: C.t3, textDecoration: 'none', cursor: 'pointer' }}
           onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = C.red; (e.currentTarget as HTMLAnchorElement).style.color = C.red; }}
           onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = C.border; (e.currentTarget as HTMLAnchorElement).style.color = C.t3; }}>
          <LogOut size={14} />
          <span style={{ fontSize: 12 }}>登出</span>
        </a>
      </div>

      {flash && <div style={{ position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: C.red, color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}><ShieldAlert size={14} style={{ display: 'inline', marginRight: 6 }} />{flash}</div>}

      {/* Grid — 桌面三欄，手機單欄 */}
      <style>{`@media(min-width:900px){.pj-grid{grid-template-columns:minmax(240px,280px) minmax(0,1fr) minmax(280px,340px)!important}}`}</style>
      <div className="pj-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, padding: 12, alignItems: 'start' }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: C.bg3, display: 'grid', placeItems: 'center' }}><User size={22} color={C.cyan} /></div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{patient.name}</div>
                <div style={{ fontSize: 12, color: C.t2 }}>{patient.age} 歲 · {patient.sex}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 11.5 }}>
              {([
                [<Hash size={11} color={C.t3} />,        '病歷號',   patient.mrn],
                [<BedDouble size={11} color={C.t3} />,   '病房/床號', patient.bed],
                [<Stethoscope size={11} color={C.t3} />, '主治醫師', patient.attending],
                [<CalendarDays size={11} color={C.t3} />,'入院日期', patient.admit],
              ] as [React.ReactNode, string, string][]).map(([icon, k, v]) => (
                <div key={k}>
                  <div style={{ color: C.t3, display: 'flex', alignItems: 'center', gap: 3 }}>{icon}{k}</div>
                  <div style={{ color: C.t1, fontFamily: 'monospace', fontSize: 12 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,.12)', color: C.green, border: `1px solid ${C.green}44` }}>{patient.code}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(244,63,94,.12)', color: C.red, border: `1px solid ${C.red}44`, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} />{patient.allergy}</span>
            </div>
            {isDev && iss && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                <div style={{ fontSize: 10, color: C.t3, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                  <ArrowRightLeft size={10} color={C.t3} />切換病人 (Dev)
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    placeholder="Patient ID"
                    value={switchId}
                    onChange={e => setSwitchId(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && switchId.trim()) window.location.href = `/api/auth/dev-login?fhirBase=${encodeURIComponent(iss)}&patientId=${switchId.trim()}`; }}
                    style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', color: C.t1, fontSize: 11, outline: 'none' }}
                  />
                  <button
                    onClick={() => { if (switchId.trim()) window.location.href = `/api/auth/dev-login?fhirBase=${encodeURIComponent(iss)}&patientId=${switchId.trim()}`; }}
                    style={{ background: C.cyanDim, border: `1px solid ${C.cyan}44`, borderRadius: 6, padding: '4px 10px', color: C.cyan, fontSize: 11, cursor: 'pointer' }}
                  >
                    查詢
                  </button>
                </div>
              </div>
            )}
          </Card>

          <Card title="執行中醫囑 (Active Orders)" icon={<Pill size={15} color={C.cyan} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {medications.map((o) => {
                const on = selectedDrug === o.id;
                return (
                  <button key={o.id} onClick={() => setSelectedDrug(o.id)} style={{ textAlign: 'left', cursor: 'pointer', background: on ? 'rgba(34,211,238,.1)' : C.bg2, border: `1px solid ${on ? C.cyan : C.border}`, borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? C.cyan : C.t3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.t1 }}>{o.name}</div>
                      <div style={{ fontSize: 10.5, color: C.t3, fontFamily: 'monospace' }}>{o.dose} · {o.freq} · {o.route}</div>
                    </div>
                    <ChevronRight size={14} color={on ? C.cyan : C.t3} />
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="主動安全警示" icon={<ShieldAlert size={15} color={C.red} />} right={<span style={{ fontSize: 10, color: C.t3, fontFamily: 'monospace' }}>event-driven</span>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.length === 0 && <div style={{ fontSize: 12, color: C.t3 }}>目前無啟用警示。</div>}
              {alerts.map((a) => {
                const col = a.level === 'danger' ? C.red : C.amber;
                return (
                  <div key={a.id} style={{ borderLeft: `3px solid ${col}`, background: `${col}14`, borderRadius: 8, padding: '8px 10px', position: 'relative' }}>
                    <button onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))} style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.t3 }}><X size={13} /></button>
                    <div style={{ fontSize: 12, fontWeight: 700, color: col, paddingRight: 16 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 3, lineHeight: 1.5 }}>{a.body}</div>
                    <span style={{ fontSize: 9.5, color: col, fontFamily: 'monospace' }}>{a.tag}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* CENTER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="生命表徵趨勢 (過去 72 小時)" icon={<Activity size={15} color={C.cyan} />}>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={vitals} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 4" />
                  <XAxis dataKey="t" tick={{ fill: C.t3, fontSize: 10 }} reversed interval={2} />
                  <YAxis tick={{ fill: C.t3, fontSize: 10 }} domain={[0, 160]} />
                  <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.borderLit}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="SBP"   stroke={C.red}    dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="DBP"   stroke={C.amber}  dot={false} strokeWidth={1.6} />
                  <Line type="monotone" dataKey="Pulse" stroke={C.cyan}   dot={false} strokeWidth={1.6} />
                  <Line type="monotone" dataKey="SpO2"  stroke={C.green}  dot={false} strokeWidth={1.6} />
                  <Line type="monotone" dataKey="Resp"  stroke={C.violet} dot={false} strokeWidth={1.4} />
                  <Line type="monotone" dataKey="Temp"  stroke={C.blue}   dot={false} strokeWidth={1.4} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title={`療效評估 — ${medications.find(m => m.id === selectedDrug)?.name ?? ''}`} icon={<Sparkles size={15} color={C.cyan} />} right={<span style={{ fontSize: 10.5, color: C.t3 }}>點選左側醫囑切換</span>}>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={EFFICACY_MOCK} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 4" />
                  <XAxis dataKey="m" tick={{ fill: C.t3, fontSize: 10 }} />
                  <YAxis yAxisId="l" tick={{ fill: C.t3, fontSize: 10 }} domain={[6, 9.5]} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: C.t3, fontSize: 10 }} domain={[120, 220]} />
                  <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.borderLit}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceArea x1="Jul" x2="Dec" yAxisId="l" fill={C.cyan} fillOpacity={0.08} />
                  <Area yAxisId="r" type="monotone" dataKey="GlucoseAC" name="Glucose AC" stroke={C.violet} fill={C.violet} fillOpacity={0.12} strokeWidth={2} />
                  <Line yAxisId="l" type="monotone" dataKey="HbA1c" name="HbA1c (%)" stroke={C.cyan} strokeWidth={2.4} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="病人歷程時間軸 (Patient Journey)" icon={<Clock size={15} color={C.cyan} />}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {journey.map((e, i) => {
                const open = expanded === e.id;
                const Icon = e.type === 'image' ? ImageIcon : e.type === 'med' ? Pill : FileText;
                const col = flagColor(e.flag);
                return (
                  <div key={e.id} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.bg2, border: `1px solid ${col}`, display: 'grid', placeItems: 'center' }}><Icon size={14} color={col} /></div>
                      {i < journey.length - 1 && <div style={{ width: 2, flex: 1, background: C.border, minHeight: 14 }} />}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 12 }}>
                      <button onClick={() => setExpanded(open ? '' : e.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: C.bg2, border: `1px solid ${open ? col : C.border}`, borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{e.title}</span>
                          <span style={{ fontSize: 10.5, color: C.t3, fontFamily: 'monospace' }}>{e.time}</span>
                        </div>
                        {open && <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {e.detail.map((d, k) => <div key={k} style={{ fontSize: 11.5, color: C.t2, fontFamily: 'monospace', paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>{d}</div>)}
                        </div>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>服藥順從性</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.green, fontFamily: 'monospace' }}>
                  {Math.round(adherence.filter(a => a.ok).length / Math.max(adherence.length, 1) * 100)}%
                </span>
              </div>
              {adherence.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: C.t2, fontFamily: 'monospace', marginBottom: 3 }}>
                  <CheckCircle2 size={13} color={a.ok ? C.green : C.red} />
                  <span style={{ width: 96 }}>{a.ts}</span><span style={{ flex: 1 }}>{a.dose}</span><span style={{ color: C.t3 }}>{a.giver}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="病人綜合指標 (Health Radar)" icon={<Stethoscope size={15} color={C.cyan} />}>
            <div style={{ height: 210, minWidth: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar} outerRadius="72%">
                  <PolarGrid stroke={C.border} />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: C.t2, fontSize: 11 }} />
                  <Radar dataKey="v" stroke={C.cyan} fill={C.cyan} fillOpacity={0.28} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="AI 智慧摘要 / 對話" icon={<Brain size={15} color={C.violet} />}>
            <div ref={scrollRef} style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200 }}>
              {aiMsgs.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
                  <div style={{ fontSize: 11.5, lineHeight: 1.55, padding: '7px 10px', borderRadius: 9, background: m.role === 'user' ? C.cyanDim : m.role === 'sys' ? 'rgba(34,197,94,.1)' : C.bg2, border: `1px solid ${m.role === 'sys' ? C.green + '44' : C.border}`, color: m.role === 'user' ? '#eafcff' : m.role === 'sys' ? C.green : C.t2 }}>{m.text}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { sendAi(aiInput); setAiInput(''); } }} placeholder="輸入訊息…" style={{ flex: 1, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.t1, fontSize: 12, padding: '7px 10px', outline: 'none' }} />
              <button onClick={() => { sendAi(aiInput); setAiInput(''); }} style={{ cursor: 'pointer', background: C.bg3, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.cyan, width: 38, display: 'grid', placeItems: 'center' }}><Send size={15} /></button>
            </div>
          </Card>

          <Card title="語音／文字 → FHIR 醫囑" icon={<Mic size={15} color={C.cyan} />}>
            <textarea value={orderText} onChange={e => { setOrderText(e.target.value); scanOrder(e.target.value); }} placeholder="例：Warfarin 5mg + Aspirin 100mg（觸發即時攔截）" rows={3} style={{ width: '100%', resize: 'vertical', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.t1, fontSize: 12, padding: 8, outline: 'none', boxSizing: 'border-box' }} />
            <button onClick={buildFhir} style={{ width: '100%', marginTop: 8, cursor: 'pointer', background: `linear-gradient(135deg,${C.cyan},${C.cyanDim})`, color: C.bg0, border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Sparkles size={14} /> 生成 FHIR 草稿
            </button>
            {fhir && (
              <div style={{ marginTop: 10, background: C.bg0, border: `1px solid ${C.borderLit}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '6px 10px', background: C.bg2, borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.cyan, fontFamily: 'monospace' }}>MedicationRequest · TW Core profile</div>
                <pre style={{ margin: 0, padding: 10, fontSize: 10.5, color: C.t2, fontFamily: 'monospace', maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(fhir, null, 2)}</pre>
                <div style={{ padding: 8, borderTop: `1px solid ${C.border}` }}>
                  {signed
                    ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: C.green, fontSize: 12.5, fontWeight: 700 }}><CheckCircle2 size={15} />已簽署並開立</div>
                    : <button onClick={() => setSigned(true)} style={{ width: '100%', cursor: 'pointer', background: C.green, color: C.bg0, border: 'none', borderRadius: 7, padding: '7px 0', fontSize: 12.5, fontWeight: 700 }}>確認簽署並開立</button>}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
