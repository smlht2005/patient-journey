/**
 * seed-fhir.mjs — 將測試資料轉為 FHIR R4 Transaction Bundle 並 POST 到本機 HAPI FHIR
 *
 * 使用方式：
 *   node scripts/seed-fhir.mjs                           # 預設 localhost:9090/fhir，名稱含時間戳
 *   node scripts/seed-fhir.mjs --name=王大華              # 自訂病人姓名
 *   node scripts/seed-fhir.mjs --fhir=http://host:9090/fhir --app=http://localhost:3000
 *   node scripts/seed-fhir.mjs --name=李小美 --fhir=http://localhost:9090/fhir
 *
 * 每次執行：
 *   - 病人姓名不同（--name 或時間戳）
 *   - MRN 唯一（T + yyyyMMddHHmm）
 *   - Lab / Vital 數值隨機化（±15%），以便區分多次 seed 結果
 *   - 與 mock 資料（陳大明）明確區分
 */

// ── 解析 CLI 參數 ────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true]; })
);

const FHIR_BASE = args.fhir ?? 'http://localhost:9090/fhir';
const APP_BASE  = args.app  ?? 'http://localhost:3000';

// 時間戳（台灣時區 UTC+8）
const now = new Date(Date.now() + 8 * 3600 * 1000);
const ts  = now.toISOString().replace(/[-:T]/g, '').slice(0, 12); // yyyyMMddHHmm
const mmdd = `${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;

// 病人姓名：--name 或「測試_MMDD_HHmm」
const PATIENT_NAME = args.name ?? `測試_${mmdd}_${hhmm}`;
const PATIENT_MRN  = `T${ts}`;                   // 唯一 MRN，不與 mock A123456789 衝突

// ── 隨機化工具 ───────────────────────────────────────────────────────────────

function jitter(base, pct = 0.15) {
  return +((base * (1 + (Math.random() * 2 - 1) * pct)).toFixed(1));
}
function jitterInt(base, pct = 0.15) {
  return Math.round(base * (1 + (Math.random() * 2 - 1) * pct));
}

// 每次執行的基準偏移（讓整批數值方向一致，呈現不同病情嚴重度）
const severityBias = (Math.random() - 0.5) * 0.2; // -0.1 ~ +0.1

// 隨機化 Lab 基準值
const LAB = {
  hba1c:      +((7.3 * (1 + severityBias)).toFixed(1)),
  ldl:        jitterInt(138),
  glucose:    jitterInt(185),
  creatinine: jitter(1.1),
  sbp:        jitterInt(152),
  hba1c_prev: +((7.4 * (1 + severityBias * 0.8)).toFixed(1)),
  ldl_prev:   jitterInt(149),
};

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

// ── FHIR Resource 建立函式 ──────────────────────────────────────────────────

function buildPatient(patientUuid) {
  const family = PATIENT_NAME.slice(0, 1);
  const given  = PATIENT_NAME.slice(1) || PATIENT_NAME;
  return {
    fullUrl: `urn:uuid:${patientUuid}`,
    resource: {
      resourceType: 'Patient',
      identifier: [{ system: 'http://hospital.tw/mrn', value: PATIENT_MRN }],
      name: [{ use: 'official', text: PATIENT_NAME, family, given: [given] }],
      gender: Math.random() > 0.5 ? 'male' : 'female',
      birthDate: `${1960 + Math.floor(Math.random() * 30)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-01`,
      extension: [
        { url: 'http://hospital.tw/fhir/StructureDefinition/bed',         valueString: `${Math.floor(Math.random() * 9) + 1}${String.fromCharCode(65 + Math.floor(Math.random() * 5))}-${String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')}` },
        { url: 'http://hospital.tw/fhir/StructureDefinition/attending',   valueString: ['王小明 醫師', '李大偉 醫師', '張美惠 醫師'][Math.floor(Math.random() * 3)] },
        { url: 'http://hospital.tw/fhir/StructureDefinition/admit-date',  valueDate: isoDate(-Math.floor(Math.random() * 14 + 1)).slice(0, 10) },
        { url: 'http://hospital.tw/fhir/StructureDefinition/code-status', valueString: 'Full Code' },
        { url: 'http://hospital.tw/fhir/StructureDefinition/allergy',     valueString: ['NKA', '對盤尼西林過敏', '對磺胺類藥物過敏'][Math.floor(Math.random() * 3)] },
      ],
      communication: [{ language: { text: 'zh-TW' } }],
    },
    request: { method: 'POST', url: 'Patient' },
  };
}

function buildObservation(patientRef, loincCode, display, value, unit, effectiveDateTime) {
  return {
    fullUrl: `urn:uuid:${uuid()}`,
    resource: {
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: loincCode, display }], text: display },
      subject: { reference: patientRef },
      effectiveDateTime,
      valueQuantity: { value, unit, system: 'http://unitsofmeasure.org' },
    },
    request: { method: 'POST', url: 'Observation' },
  };
}

function buildVitalObservation(patientRef, loincCode, display, value, unit, effectiveDateTime) {
  return {
    fullUrl: `urn:uuid:${uuid()}`,
    resource: {
      resourceType: 'Observation',
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: loincCode, display }], text: display },
      subject: { reference: patientRef },
      effectiveDateTime,
      valueQuantity: { value, unit, system: 'http://unitsofmeasure.org' },
    },
    request: { method: 'POST', url: 'Observation' },
  };
}

function buildMedicationRequest(patientRef, drugName, dose, freq, route, loincMonitor) {
  return {
    fullUrl: `urn:uuid:${uuid()}`,
    resource: {
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      medicationCodeableConcept: {
        text: `${drugName} ${dose}`,
        coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', display: drugName }],
      },
      subject: { reference: patientRef },
      authoredOn: isoDate(-14),
      dosageInstruction: [{
        text: `${dose} ${freq} ${route}`,
        timing: { code: { text: freq } },
        route: { text: route },
        doseAndRate: [{ doseQuantity: { value: 1, unit: dose } }],
      }],
      note: [{ text: `監測指標：${loincMonitor}` }],
    },
    request: { method: 'POST', url: 'MedicationRequest' },
  };
}

function buildMedAdministration(patientRef, offsetDays, dose, giver) {
  return {
    fullUrl: `urn:uuid:${uuid()}`,
    resource: {
      resourceType: 'MedicationAdministration',
      status: 'completed',
      medicationCodeableConcept: { text: 'Metformin 500mg' },
      subject: { reference: patientRef },
      effectiveDateTime: isoDate(offsetDays),
      dosage: { dose: { value: 1, unit: dose } },
      performer: [{ actor: { display: giver } }],
    },
    request: { method: 'POST', url: 'MedicationAdministration' },
  };
}

function buildDiagnosticReport(patientRef, title, category, effectiveDateTime, conclusions) {
  return {
    fullUrl: `urn:uuid:${uuid()}`,
    resource: {
      resourceType: 'DiagnosticReport',
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: category }] }],
      code: { text: title },
      subject: { reference: patientRef },
      effectiveDateTime,
      conclusion: conclusions.join('\n'),
    },
    request: { method: 'POST', url: 'DiagnosticReport' },
  };
}

// ── Bundle 組裝 ─────────────────────────────────────────────────────────────

const patientUuid = uuid();
const patientRef  = `urn:uuid:${patientUuid}`;
const entries     = [];

// Patient
entries.push(buildPatient(patientUuid));

// Labs（使用隨機化數值）
const labDate = isoDate(0).slice(0, 10) + 'T13:12:00+08:00';
entries.push(buildObservation(patientRef, '4548-4',  'HbA1c',           LAB.hba1c,      '%',    labDate));
entries.push(buildObservation(patientRef, '2093-3',  'LDL Cholesterol', LAB.ldl,        'mg/dL', labDate));
entries.push(buildObservation(patientRef, '2345-7',  'Glucose AC',      LAB.glucose,    'mg/dL', labDate));
entries.push(buildObservation(patientRef, '38483-4', 'Creatinine',      LAB.creatinine, 'mg/dL', labDate));
entries.push(buildObservation(patientRef, '8480-6',  'Systolic BP',     LAB.sbp,        'mmHg',  labDate));

// Previous labs
entries.push(buildObservation(patientRef, '4548-4', 'HbA1c',           LAB.hba1c_prev, '%',    isoDate(-14).slice(0,10) + 'T09:30:00+08:00'));
entries.push(buildObservation(patientRef, '2093-3', 'LDL Cholesterol', LAB.ldl_prev,   'mg/dL', isoDate(-28).slice(0,10) + 'T10:05:00+08:00'));

// Vitals（19 時間點，每項數值隨機化）
const vitalLoinc = [
  { code: '8310-5',  display: 'Body temperature',  unit: 'Cel',  base: 36.6, amp: 0.45, spike: 0.6  },
  { code: '8867-4',  display: 'Heart rate',         unit: '/min', base: 80,   amp: 9,    spike: 8    },
  { code: '9279-1',  display: 'Respiratory rate',   unit: '/min', base: 16,   amp: 2,    spike: 0    },
  { code: '8480-6',  display: 'Systolic BP',        unit: 'mmHg', base: LAB.sbp - 14, amp: 11, spike: 8 },
  { code: '8462-4',  display: 'Diastolic BP',       unit: 'mmHg', base: 85,   amp: 6,    spike: 0    },
  { code: '59408-5', display: 'Oxygen saturation',  unit: '%',    base: 97,   amp: 0.9,  spike: 0    },
];

for (let i = 0; i < 19; i++) {
  const effectiveDateTime = new Date(Date.now() - (72 - i * 4) * 3600 * 1000).toISOString();
  for (const v of vitalLoinc) {
    const raw = v.base + Math.sin(i * 0.35) * v.amp + (i === 9 ? v.spike : 0);
    const val = v.unit === 'Cel' || v.unit === '%' ? +raw.toFixed(1) : Math.round(raw);
    entries.push(buildVitalObservation(patientRef, v.code, v.display, val, v.unit, effectiveDateTime));
  }
}

// MedicationRequests
entries.push(buildMedicationRequest(patientRef, 'Metformin',         '500mg',    'QD',  'PO', 'HbA1c / Glucose AC'));
entries.push(buildMedicationRequest(patientRef, 'Januvia',           '100mg',    'QD',  'PO', 'HbA1c / Glucose AC'));
entries.push(buildMedicationRequest(patientRef, 'Insulin Glargine',  '10 units', 'QHS', 'SC', 'Glucose AC'));
entries.push(buildMedicationRequest(patientRef, 'Lisinopril',        '10mg',     'QD',  'PO', 'Systolic BP / K+'));
entries.push(buildMedicationRequest(patientRef, 'Atorvastatin',      '10mg',     'QD',  'PO', 'LDL Cholesterol'));

// MedicationAdministrations
entries.push(buildMedAdministration(patientRef,  0, '1 tablet', 'RN 林'));
entries.push(buildMedAdministration(patientRef, -1, '1 tablet', 'RN 陳'));
entries.push(buildMedAdministration(patientRef, -2, '1 tablet', 'RN 林'));

// DiagnosticReports
const flag = v => v > 0 ? ' ▲' : '';
entries.push(buildDiagnosticReport(patientRef, '檢驗報告 (5 項)', 'LAB', labDate, [
  `Glucose AC — ${LAB.glucose} mg/dL${flag(LAB.glucose - 180)}`,
  `Creatinine — ${LAB.creatinine} mg/dL`,
  `Systolic BP — ${LAB.sbp} mmHg${flag(LAB.sbp - 140)}`,
  `HbA1c — ${LAB.hba1c} %`,
  `LDL Cholesterol — ${LAB.ldl} mg/dL${flag(LAB.ldl - 130)}`,
]));
entries.push(buildDiagnosticReport(patientRef, '影像報告 — Chest X-Ray', 'RAD', labDate,
  ['心肺輪廓正常，無浸潤或肋膜積水。', 'Impression: No acute cardiopulmonary process.']));
entries.push(buildDiagnosticReport(patientRef, '檢驗報告 — HbA1c', 'LAB',
  isoDate(-14).slice(0, 10) + 'T09:30:00+08:00',
  [`HbA1c — ${LAB.hba1c_prev} %`]));
entries.push(buildDiagnosticReport(patientRef, '檢驗報告 — LDL Cholesterol', 'LAB',
  isoDate(-28).slice(0, 10) + 'T10:05:00+08:00',
  [`LDL — ${LAB.ldl_prev} mg/dL${flag(LAB.ldl_prev - 130)}`]));

const bundle = { resourceType: 'Bundle', type: 'transaction', entry: entries };

// ── POST 到 HAPI FHIR ───────────────────────────────────────────────────────

console.log(`\n🌐 FHIR target : ${FHIR_BASE}`);
console.log(`👤 病人姓名    : ${PATIENT_NAME}`);
console.log(`🪪  MRN        : ${PATIENT_MRN}`);
console.log(`🧪 Lab 數值    : HbA1c ${LAB.hba1c}% | LDL ${LAB.ldl} | Glucose ${LAB.glucose} | SBP ${LAB.sbp}`);
console.log(`📦 Bundle 數量 : ${entries.length} entries`);
console.log('⏳ Posting...\n');

let res;
try {
  res = await fetch(FHIR_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' },
    body: JSON.stringify(bundle),
  });
} catch (err) {
  console.error(`❌ 無法連線到 ${FHIR_BASE}\n   ${err.message}`);
  console.error('\n請確認 HAPI FHIR Docker 正在運行：');
  console.error('  docker run -p 9090:8080 hapiproject/hapi:latest\n');
  process.exit(1);
}

if (!res.ok) {
  const body = await res.text();
  console.error(`❌ FHIR 回傳 ${res.status}:\n${body.slice(0, 500)}`);
  process.exit(1);
}

const responseBundle = await res.json();

const patientEntry   = responseBundle.entry?.find(e => e.response?.location?.startsWith('Patient/'));
const serverPatientId = patientEntry?.response?.location?.replace('Patient/', '').split('/')[0];

if (!serverPatientId) {
  console.error('⚠️  無法從 response 取得 Patient ID，請手動查詢：');
  console.error(`  GET ${FHIR_BASE}/Patient?identifier=${PATIENT_MRN}`);
  process.exit(1);
}

console.log('✅ Seed 完成！');
console.log(`\n👤 病人姓名   : ${PATIENT_NAME}`);
console.log(`🪪  Patient ID : ${serverPatientId}  (MRN: ${PATIENT_MRN})`);
console.log(`\n🚀 Dev Login URL：`);
console.log(`\n   ${APP_BASE}/api/auth/dev-login?fhirBase=${encodeURIComponent(FHIR_BASE)}&patientId=${serverPatientId}\n`);
