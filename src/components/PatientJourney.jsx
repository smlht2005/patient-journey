import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ComposedChart, Area, ReferenceArea, ResponsiveContainer,
} from "recharts";
import {
  Activity, AlertTriangle, Pill, FileText, Image as ImageIcon, Search,
  User, Mic, Send, X, CheckCircle2, Clock, ShieldAlert, Brain,
  Stethoscope, ChevronRight, Sparkles, Radio,
} from "lucide-react";

/* ===========================================================================
   Patient Journey — 病人就醫歷程智慧平台 (POC / Demo)
   單檔可運行前端。資料皆為模擬 FHIR TW Core 結構，無真實病人資料。
   =========================================================================== */

const C = {
  bg0: "#050b18", bg1: "#0a1424", bg2: "#0e1c33", bg3: "#13294b",
  border: "#1c3458", borderLit: "#2a4d7a",
  t1: "#e6f4ff", t2: "#8fb8d6", t3: "#5a7d9c",
  cyan: "#22d3ee", cyanDim: "#0e7490",
  red: "#f43f5e", amber: "#f59e0b", green: "#22c55e", violet: "#a78bfa", blue: "#60a5fa",
};

const FONT = "'IBM Plex Sans', 'Noto Sans TC', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* ---------- Mock data (simulated FHIR TW Core) ---------- */
const PATIENT = {
  name: "陳大明", age: 46, sex: "男性", mrn: "A123456789",
  bed: "5B-12", attending: "王小明 醫師", admit: "2025-09-25",
  code: "Full Code", allergy: "對盤尼西林過敏 (NKA)",
};

const VITALS = Array.from({ length: 19 }, (_, i) => {
  const h = 72 - i * 4;
  return {
    t: `${h}h`,
    Temp: +(36.6 + Math.sin(i * 0.5) * 0.45 + (i === 9 ? 0.6 : 0)).toFixed(1),
    Pulse: Math.round(80 + Math.sin(i * 0.35) * 9 + (i === 9 ? 8 : 0)),
    Resp: Math.round(16 + Math.sin(i * 0.4) * 2),
    SBP: Math.round(138 + Math.sin(i * 0.22) * 11 + (i > 14 ? 8 : 0)),
    DBP: Math.round(85 + Math.sin(i * 0.3) * 6),
    SpO2: +(97 + Math.sin(i * 0.15) * 0.9).toFixed(0),
  };
});

const EFFICACY = [
  { m: "Jun", HbA1c: 8.9, GlucoseAC: 212, onDrug: false },
  { m: "Jul", HbA1c: 8.6, GlucoseAC: 196, onDrug: true },
  { m: "Aug", HbA1c: 8.2, GlucoseAC: 184, onDrug: true },
  { m: "Sep", HbA1c: 7.9, GlucoseAC: 171, onDrug: true },
  { m: "Oct", HbA1c: 7.6, GlucoseAC: 160, onDrug: true },
  { m: "Nov", HbA1c: 7.4, GlucoseAC: 149, onDrug: true },
  { m: "Dec", HbA1c: 7.3, GlucoseAC: 140, onDrug: true },
];

const RADAR = [
  { dim: "血壓", v: 62 }, { dim: "心率", v: 84 }, { dim: "肝功能", v: 90 },
  { dim: "呼吸", v: 92 }, { dim: "感染", v: 74 }, { dim: "凝血", v: 58 },
];

const ORDERS = [
  { id: "metformin", name: "Metformin 500mg", dose: "1 tablet", freq: "QD", route: "PO", lab: "HbA1c / Glucose AC" },
  { id: "januvia", name: "Januvia 100mg", dose: "1 tablet", freq: "QD", route: "PO", lab: "HbA1c / Glucose AC" },
  { id: "insulin", name: "Insulin Glargine", dose: "10 units", freq: "QHS", route: "SC", lab: "Glucose AC" },
  { id: "lisinopril", name: "Lisinopril 10mg", dose: "1 tablet", freq: "QD", route: "PO", lab: "Systolic BP / K+" },
  { id: "atorvastatin", name: "Atorvastatin 10mg", dose: "1 tablet", freq: "QD", route: "PO", lab: "LDL Cholesterol" },
];

const JOURNEY = [
  {
    id: "j1", type: "lab", time: "2025/12/24 13:12", title: "檢驗報告 (5 項)",
    detail: ["Glucose AC — 185 mg/dL ▲", "Creatinine — 1.1 mg/dL", "Systolic BP — 152 mmHg ▲", "HbA1c — 7.3 %", "LDL Cholesterol — 138 mg/dL ▲"],
    flag: "warning",
  },
  { id: "j2", type: "image", time: "2025/12/24 13:12", title: "影像報告 — Chest X-Ray", detail: ["心肺輪廓正常，無浸潤或肋膜積水。", "Impression: No acute cardiopulmonary process."], flag: "normal" },
  {
    id: "j3", type: "med", time: "2025/12/17 13:12", title: "新增用藥 (多項)",
    detail: ORDERS.map((o) => `${o.name} — ${o.dose} / ${o.freq} / ${o.route}`), flag: "info",
  },
  { id: "j4", type: "lab", time: "2025/11/20 09:30", title: "檢驗報告 — HbA1c Report", detail: ["HbA1c — 7.4 % (前次 7.6 %)"], flag: "normal" },
  { id: "j5", type: "lab", time: "2025/10/25 10:05", title: "檢驗報告 — LDL Cholesterol", detail: ["LDL — 149 mg/dL ▲ (目標 < 100)"], flag: "warning" },
];

const ADHERENCE = [
  { ts: "12/24 13:12", dose: "1 tablet", giver: "RN 林", ok: true },
  { ts: "12/23 13:12", dose: "1 tablet", giver: "RN 陳", ok: true },
  { ts: "12/22 13:12", dose: "1 tablet", giver: "RN 林", ok: true },
];

const ALERTS_SEED = [
  { id: "a1", level: "danger", title: "嚴重藥物交互作用 (Warfarin + Aspirin)", body: "偵測到兩款藥物併用可能增加出血風險，建議立即評估並調整劑量。", tag: "Drug-Drug" },
  { id: "a2", level: "warning", title: "高血壓警示", body: "收縮壓 152 mmHg 超出安全範圍，建議評估控制情況並調整用藥。", tag: "SBP > 140" },
  { id: "a3", level: "warning", title: "高血糖警示", body: "血糖 185 mg/dL 高於 180 mg/dL，建議評估糖尿病控制情況。", tag: "Glucose > 180" },
  { id: "a4", level: "warning", title: "高 LDL 警示", body: "LDL 138 mg/dL 超過 130 mg/dL，建議調整飲食與用藥。", tag: "LDL > 130" },
];

const AI_SEED = [
  { role: "sys", text: "Patient Journey loaded successfully via FHIR API." },
  { role: "ai", text: "AI 智慧摘要｜主要診斷：第 2 型糖尿病合併高血壓、高血脂。慢性病史：DM-T2(12y)、HTN(8y)。追蹤重點：HbA1c 目標 <7.0%、Creatinine、血鉀(K+)。" },
  { role: "ai", text: "預判性提醒：建議在增加 Lisinopril 劑量前，先確認血鉀濃度 (K+)。" },
];

/* ---------- small primitives ---------- */
function Card({ title, icon, right, children, style }) {
  return (
    <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", ...style }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
          {icon}
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3, color: C.t1, flex: 1 }}>{title}</span>
          {right}
        </div>
      )}
      <div style={{ padding: 12, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

const flagColor = (f) => (f === "danger" ? C.red : f === "warning" ? C.amber : f === "normal" ? C.green : C.cyan);

/* ===========================================================================
   Main
   =========================================================================== */
export default function PatientJourney() {
  const [selectedDrug, setSelectedDrug] = useState("metformin");
  const [alerts, setAlerts] = useState(ALERTS_SEED);
  const [expanded, setExpanded] = useState("j1");
  const [aiMsgs, setAiMsgs] = useState(AI_SEED);
  const [orderText, setOrderText] = useState("");
  const [fhir, setFhir] = useState(null);
  const [signed, setSigned] = useState(false);
  const [flash, setFlash] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const id = "ibm-plex-fonts";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [aiMsgs]);

  /* event-driven safety engine: 文字醫囑即時掃描高風險組合 */
  const scanOrder = (txt) => {
    const t = txt.toLowerCase();
    if ((t.includes("warfarin") || t.includes("可邁丁")) && (t.includes("aspirin") || t.includes("阿斯匹靈"))) {
      if (!alerts.find((a) => a.id === "live")) {
        setAlerts((p) => [{ id: "live", level: "danger", title: "即時攔截：Warfarin + Aspirin", body: "輸入醫囑觸發嚴重交互作用，出血風險升高，建議立即評估。", tag: "Live-Intercept" }, ...p]);
        setFlash("已即時攔截 Warfarin + Aspirin 高風險組合");
        setTimeout(() => setFlash(null), 2600);
      }
    }
  };

  /* 語音／文字 → FHIR TW Core MedicationRequest 草稿 */
  const buildFhir = () => {
    const txt = orderText || "病人有體液滯留，開立 Lasix 40mg IV STAT";
    const isLasix = /lasix|furosemide|利尿/i.test(txt);
    const draft = {
      resourceType: "MedicationRequest",
      status: "draft",
      intent: "order",
      priority: /stat|立即/i.test(txt) ? "stat" : "routine",
      medicationCodeableConcept: {
        coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: isLasix ? "4603" : "0000", display: isLasix ? "Furosemide" : "（待解析）" }],
        text: isLasix ? "Furosemide (Lasix) 40 mg" : txt,
      },
      subject: { reference: `Patient/${PATIENT.mrn}`, display: PATIENT.name },
      dosageInstruction: [{
        text: isLasix ? "40 mg IV Push, STAT (once)" : txt,
        route: { coding: [{ display: "IV Push" }] },
        doseAndRate: [{ doseQuantity: { value: 40, unit: "mg" } }],
      }],
      reasonCode: [{ text: /體液|滯留|edema/i.test(txt) ? "Fluid overload / edema" : "—" }],
      meta: { profile: ["https://twcore.mohw.gov.tw/ig/twcore/StructureDefinition/MedicationRequest-twcore"] },
    };
    setFhir(draft); setSigned(false);
  };

  const sendAi = (text) => {
    if (!text.trim()) return;
    setAiMsgs((p) => [...p, { role: "user", text }]);
    setTimeout(() => {
      let reply = "已記錄。可於時間軸點選藥品檢視療效疊圖，或於下方輸入醫囑生成 FHIR 草稿。";
      if (/lisinopril|血鉀|k\+/i.test(text)) reply = "Lisinopril 為 ACEI，提升劑量前務必確認血鉀 (K+)，避免高血鉀。目前最近一次 K+ 尚無資料，建議今日補驗。";
      else if (/hba1c|血糖|糖尿/i.test(text)) reply = "近半年 HbA1c 自 8.9% 降至 7.3%，與 Metformin 起始期吻合，療效明確；仍未達 <7.0% 目標，可評估劑量。";
      else if (/警示|alert|風險/i.test(text)) reply = "目前有 1 項嚴重 (藥物交互作用) 與 3 項警告 (高血壓/高血糖/高 LDL)，皆由事件驅動引擎即時觸發。";
      setAiMsgs((p) => [...p, { role: "ai", text: reply }]);
    }, 650);
  };

  const dismiss = (id) => setAlerts((p) => p.filter((a) => a.id !== id));

  return (
    <div style={{ background: C.bg0, minHeight: "100vh", color: C.t1, fontFamily: FONT, backgroundImage: `radial-gradient(900px 500px at 80% -10%, rgba(34,211,238,.07), transparent), radial-gradient(700px 400px at 0% 110%, rgba(167,139,250,.06), transparent)` }}>
      {/* ===== Header ===== */}
      <div style={{ height: 54, display: "flex", alignItems: "center", gap: 14, padding: "0 16px", borderBottom: `1px solid ${C.border}`, background: "rgba(10,20,36,.85)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, letterSpacing: 0.5 }}>
          <Activity size={20} color={C.cyan} />
          <span>Patient Journey</span>
          <span style={{ fontSize: 10, color: C.cyan, border: `1px solid ${C.cyanDim}`, borderRadius: 6, padding: "1px 6px", fontFamily: MONO }}>FHIR TW Core</span>
        </div>
        <div style={{ flex: 1, maxWidth: 460, display: "flex", alignItems: "center", gap: 8, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 12px" }}>
          <Search size={15} color={C.t3} />
          <input placeholder="搜尋病歷 / 關鍵字…" style={{ background: "transparent", border: "none", outline: "none", color: C.t1, fontSize: 13, width: "100%", fontFamily: FONT }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.t2 }}>
          <Radio size={13} color={C.green} /> SMART on FHIR · OAuth2
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 10px 4px 6px" }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg,${C.cyan},${C.violet})`, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: C.bg0 }}>S</div>
          <span style={{ fontSize: 12 }}>Dr. Sun</span>
        </div>
      </div>

      {flash && (
        <div style={{ position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: C.red, color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 30px rgba(244,63,94,.4)", display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldAlert size={16} /> {flash}
        </div>
      )}

      {/* ===== Grid ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,280px) minmax(0,1fr) minmax(280px,340px)", gap: 12, padding: 12, alignItems: "start" }} className="pj-grid">
        {/* ---------- LEFT ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Patient card */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: C.bg3, display: "grid", placeItems: "center" }}><User size={22} color={C.cyan} /></div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{PATIENT.name}</div>
                <div style={{ fontSize: 12, color: C.t2 }}>{PATIENT.age} 歲 · {PATIENT.sex}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px", fontSize: 11.5 }}>
              {[["病歷號 (MRN)", PATIENT.mrn], ["病房/床號", PATIENT.bed], ["主治醫師", PATIENT.attending], ["入院日期", PATIENT.admit]].map(([k, v]) => (
                <div key={k}><div style={{ color: C.t3 }}>{k}</div><div style={{ color: C.t1, fontFamily: MONO, fontSize: 12 }}>{v}</div></div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(34,197,94,.12)", color: C.green, border: `1px solid ${C.green}44` }}>{PATIENT.code}</span>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(244,63,94,.12)", color: C.red, border: `1px solid ${C.red}44`, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={11} />{PATIENT.allergy}</span>
            </div>
          </Card>

          {/* Active orders */}
          <Card title="執行中醫囑 (Active Orders)" icon={<Pill size={15} color={C.cyan} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ORDERS.map((o) => {
                const on = selectedDrug === o.id;
                return (
                  <button key={o.id} onClick={() => setSelectedDrug(o.id)}
                    style={{ textAlign: "left", cursor: "pointer", background: on ? "rgba(34,211,238,.1)" : C.bg2, border: `1px solid ${on ? C.cyan : C.border}`, borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? C.cyan : C.t3 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.t1 }}>{o.name}</div>
                      <div style={{ fontSize: 10.5, color: C.t3, fontFamily: MONO }}>{o.dose} · {o.freq} · {o.route}</div>
                    </div>
                    <ChevronRight size={14} color={on ? C.cyan : C.t3} />
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Alerts */}
          <Card title="主動安全警示" icon={<ShieldAlert size={15} color={C.red} />} right={<span style={{ fontSize: 10, color: C.t3, fontFamily: MONO }}>event-driven</span>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alerts.length === 0 && <div style={{ fontSize: 12, color: C.t3, padding: "8px 0" }}>目前無啟用警示。</div>}
              {alerts.map((a) => {
                const col = a.level === "danger" ? C.red : C.amber;
                return (
                  <div key={a.id} style={{ borderLeft: `3px solid ${col}`, background: `${col}14`, borderRadius: 8, padding: "8px 10px", position: "relative" }}>
                    <button onClick={() => dismiss(a.id)} style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", cursor: "pointer", color: C.t3 }}><X size={13} /></button>
                    <div style={{ fontSize: 12, fontWeight: 700, color: col, paddingRight: 16 }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: C.t2, marginTop: 3, lineHeight: 1.5 }}>{a.body}</div>
                    <span style={{ fontSize: 9.5, color: col, fontFamily: MONO, opacity: 0.8 }}>{a.tag}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* ---------- CENTER ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Vitals */}
          <Card title="生命表徵趨勢 (過去 72 小時)" icon={<Activity size={15} color={C.cyan} />}>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={VITALS} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 4" />
                  <XAxis dataKey="t" tick={{ fill: C.t3, fontSize: 10 }} reversed interval={2} />
                  <YAxis tick={{ fill: C.t3, fontSize: 10 }} domain={[0, 160]} />
                  <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.borderLit}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.t1 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="SBP" stroke={C.red} dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="DBP" stroke={C.amber} dot={false} strokeWidth={1.6} />
                  <Line type="monotone" dataKey="Pulse" stroke={C.cyan} dot={false} strokeWidth={1.6} />
                  <Line type="monotone" dataKey="SpO2" stroke={C.green} dot={false} strokeWidth={1.6} />
                  <Line type="monotone" dataKey="Resp" stroke={C.violet} dot={false} strokeWidth={1.4} />
                  <Line type="monotone" dataKey="Temp" stroke={C.blue} dot={false} strokeWidth={1.4} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Efficacy overlay */}
          <Card title={`療效評估 — ${ORDERS.find((o) => o.id === selectedDrug)?.name}`} icon={<Sparkles size={15} color={C.cyan} />}
            right={<span style={{ fontSize: 10.5, color: C.t3 }}>點選左側醫囑切換</span>}>
            <div style={{ fontSize: 11, color: C.t2, marginBottom: 6 }}>用藥期間 (陰影) 與檢驗趨勢疊合，使數據自我說明療效。</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={EFFICACY} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 4" />
                  <XAxis dataKey="m" tick={{ fill: C.t3, fontSize: 10 }} />
                  <YAxis yAxisId="l" tick={{ fill: C.t3, fontSize: 10 }} domain={[6, 9.5]} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: C.t3, fontSize: 10 }} domain={[120, 220]} />
                  <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.borderLit}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceArea x1="Jul" x2="Dec" yAxisId="l" fill={C.cyan} fillOpacity={0.08} />
                  <Area yAxisId="r" type="monotone" dataKey="GlucoseAC" name="Glucose AC (mg/dL)" stroke={C.violet} fill={C.violet} fillOpacity={0.12} strokeWidth={2} />
                  <Line yAxisId="l" type="monotone" dataKey="HbA1c" name="HbA1c (%)" stroke={C.cyan} strokeWidth={2.4} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Timeline */}
          <Card title="病人歷程時間軸 (Patient Journey)" icon={<Clock size={15} color={C.cyan} />}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {JOURNEY.map((e, i) => {
                const open = expanded === e.id;
                const Icon = e.type === "lab" ? FileText : e.type === "image" ? ImageIcon : Pill;
                const col = flagColor(e.flag);
                return (
                  <div key={e.id} style={{ display: "flex", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.bg2, border: `1px solid ${col}`, display: "grid", placeItems: "center" }}><Icon size={14} color={col} /></div>
                      {i < JOURNEY.length - 1 && <div style={{ width: 2, flex: 1, background: C.border, minHeight: 14 }} />}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 12 }}>
                      <button onClick={() => setExpanded(open ? null : e.id)} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: C.bg2, border: `1px solid ${open ? col : C.border}`, borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{e.title}</span>
                          <span style={{ fontSize: 10.5, color: C.t3, fontFamily: MONO }}>{e.time}</span>
                        </div>
                        {open && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                            {e.detail.map((d, k) => <div key={k} style={{ fontSize: 11.5, color: C.t2, fontFamily: MONO, paddingLeft: 8, borderLeft: `2px solid ${C.border}` }}>{d}</div>)}
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Adherence */}
            <div style={{ marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>服藥順從性</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.green, fontFamily: MONO }}>100%</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ADHERENCE.map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: C.t2, fontFamily: MONO }}>
                    <CheckCircle2 size={13} color={C.green} />
                    <span style={{ width: 96 }}>{a.ts}</span><span style={{ flex: 1 }}>{a.dose}</span><span style={{ color: C.t3 }}>{a.giver}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* ---------- RIGHT ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Radar */}
          <Card title="病人綜合指標 (Health Radar)" icon={<Stethoscope size={15} color={C.cyan} />}>
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={RADAR} outerRadius="72%">
                  <PolarGrid stroke={C.border} />
                  <PolarAngleAxis dataKey="dim" tick={{ fill: C.t2, fontSize: 11 }} />
                  <Radar dataKey="v" stroke={C.cyan} fill={C.cyan} fillOpacity={0.28} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 10.5, color: C.t3, textAlign: "center" }}>數值愈高代表風險／關注度愈高</div>
          </Card>

          {/* AI panel */}
          <Card title="AI 智慧摘要 / 對話" icon={<Brain size={15} color={C.violet} />} style={{ flex: 1 }}>
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, paddingRight: 2 }}>
              {aiMsgs.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%" }}>
                  <div style={{
                    fontSize: 11.5, lineHeight: 1.55, padding: "7px 10px", borderRadius: 9,
                    background: m.role === "user" ? C.cyanDim : m.role === "sys" ? "rgba(34,197,94,.1)" : C.bg2,
                    border: `1px solid ${m.role === "sys" ? C.green + "44" : C.border}`,
                    color: m.role === "user" ? "#eafcff" : m.role === "sys" ? C.green : C.t2,
                    fontFamily: m.role === "sys" ? MONO : FONT,
                  }}>{m.text}</div>
                </div>
              ))}
            </div>
            <AiInput onSend={sendAi} />
          </Card>

          {/* Voice → FHIR */}
          <Card title="語音／文字 → FHIR 醫囑" icon={<Mic size={15} color={C.cyan} />}>
            <textarea value={orderText} onChange={(e) => { setOrderText(e.target.value); scanOrder(e.target.value); }}
              placeholder='例：病人有體液滯留，開立 Lasix 40mg IV STAT（輸入含 Warfarin + Aspirin 可觸發即時攔截）'
              rows={3} style={{ width: "100%", resize: "vertical", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.t1, fontSize: 12, padding: 8, outline: "none", fontFamily: FONT, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={buildFhir} style={{ flex: 1, cursor: "pointer", background: `linear-gradient(135deg,${C.cyan},${C.cyanDim})`, color: C.bg0, border: "none", borderRadius: 8, padding: "8px 0", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Sparkles size={14} /> 生成 FHIR 草稿
              </button>
            </div>

            {fhir && (
              <div style={{ marginTop: 10, background: C.bg0, border: `1px solid ${C.borderLit}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: C.bg2, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.cyan, fontFamily: MONO }}>MedicationRequest (draft)</span>
                  <span style={{ fontSize: 9.5, color: C.t3, fontFamily: MONO }}>TW Core profile</span>
                </div>
                <pre style={{ margin: 0, padding: 10, fontSize: 10.5, lineHeight: 1.5, color: C.t2, fontFamily: MONO, maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(fhir, null, 2)}</pre>
                <div style={{ padding: 8, borderTop: `1px solid ${C.border}` }}>
                  {signed ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: C.green, fontSize: 12.5, fontWeight: 700 }}><CheckCircle2 size={15} /> 已簽署並開立</div>
                  ) : (
                    <button onClick={() => setSigned(true)} style={{ width: "100%", cursor: "pointer", background: C.green, color: C.bg0, border: "none", borderRadius: 7, padding: "7px 0", fontSize: 12.5, fontWeight: 700 }}>確認簽署並開立</button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 10.5, color: C.t3, padding: "4px 0 16px" }}>
        Patient Journey POC · 模擬資料，無真實病人個資 · RWD / SMART on FHIR / OAuth2 · 事件驅動主動安全
      </div>

      <style>{`
        .pj-grid { }
        @media (max-width: 1024px){ .pj-grid{ grid-template-columns: 1fr !important; } }
        ::-webkit-scrollbar{ width:7px; height:7px; }
        ::-webkit-scrollbar-thumb{ background:${C.border}; border-radius:4px; }
        ::-webkit-scrollbar-track{ background:transparent; }
      `}</style>
    </div>
  );
}

function AiInput({ onSend }) {
  const [v, setV] = useState("");
  const go = () => { onSend(v); setV(""); };
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder="輸入訊息…" style={{ flex: 1, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.t1, fontSize: 12, padding: "7px 10px", outline: "none", fontFamily: FONT }} />
      <button onClick={go} style={{ cursor: "pointer", background: C.bg3, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.cyan, width: 38, display: "grid", placeItems: "center" }}><Send size={15} /></button>
    </div>
  );
}
