/**
 * seed-fhir.mjs — 將 mock 資料轉為 FHIR R4 Transaction Bundle 並 POST 到本機 HAPI FHIR
 * 使用方式：node scripts/seed-fhir.mjs [FHIR_BASE] [APP_BASE]
 * 預設：FHIR_BASE=http://localhost:9090  APP_BASE=http://localhost:3000
 */

const FHIR_BASE = process.argv[2] ?? 'http://localhost:9090/fhir';
const APP_BASE  = process.argv[3] ?? 'http://localhost:3000';

// ── 工具函式 ────────────────────────────────────────────────────────────────

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
  return {
    fullUrl: `urn:uuid:${patientUuid}`,
    resource: {
      resourceType: 'Patient',
      identifier: [{ system: 'http://hospital.tw/mrn', value: 'A123456789' }],
      name: [{ use: 'official', text: '陳大明', family: '陳', given: ['大明'] }],
      gender: 'male',
      birthDate: '1979-01-01',
      extension: [
        { url: 'http://hospital.tw/fhir/StructureDefinition/bed',         valueString: '5B-12' },
        { url: 'http://hospital.tw/fhir/StructureDefinition/attending',   valueString: '王小明 醫師' },
        { url: 'http://hospital.tw/fhir/StructureDefinition/admit-date',  valueDate:   '2025-09-25' },
        { url: 'http://hospital.tw/fhir/StructureDefinition/code-status', valueString: 'Full Code' },
      ],
      communication: [{ language: { text: 'zh-TW' } }],
    },
    request: { method: 'POST', url: 'Patient' },
  };
}

function buildObservation(patientRef, loincCode, display, value, unit, effectiveDateTime, status = 'final') {
  return {
    fullUrl: `urn:uuid:${uuid()}`,
    resource: {
      resourceType: 'Observation',
      status,
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
  const routeCode = route === 'PO' ? 'PO' : route === 'SC' ? 'SC' : route;
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
        text: `${dose} ${freq} ${routeCode}`,
        timing: { code: { text: freq } },
        route: { text: route },
        doseAndRate: [{ doseQuantity: { value: 1, unit: dose } }],
      }],
      note: [{ text: `監測指標：${loincMonitor}` }],
    },
    request: { method: 'POST', url: 'MedicationRequest' },
  };
}

function buildMedAdministration(patientRef, ts, dose, giver) {
  return {
    fullUrl: `urn:uuid:${uuid()}`,
    resource: {
      resourceType: 'MedicationAdministration',
      status: 'completed',
      medicationCodeableConcept: { text: 'Metformin 500mg' },
      subject: { reference: patientRef },
      effectiveDateTime: new Date(2025, 11, Number(ts.split('/')[1].split(' ')[0]),
        Number(ts.split(' ')[1].split(':')[0]),
        Number(ts.split(' ')[1].split(':')[1])).toISOString(),
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

const entries = [];

// Patient
entries.push(buildPatient(patientUuid));

// Labs (Observations)
entries.push(buildObservation(patientRef, '4548-4',  'HbA1c',           7.3,  '%',    '2025-12-24T13:12:00+08:00'));
entries.push(buildObservation(patientRef, '2093-3',  'LDL Cholesterol', 138,  'mg/dL','2025-12-24T13:12:00+08:00'));
entries.push(buildObservation(patientRef, '2345-7',  'Glucose AC',      185,  'mg/dL','2025-12-24T13:12:00+08:00'));
entries.push(buildObservation(patientRef, '38483-4', 'Creatinine',      1.1,  'mg/dL','2025-12-24T13:12:00+08:00'));
entries.push(buildObservation(patientRef, '8480-6',  'Systolic BP',     152,  'mmHg', '2025-12-24T13:12:00+08:00'));

// Previous labs (journey j4, j5)
entries.push(buildObservation(patientRef, '4548-4',  'HbA1c',           7.4,  '%',    '2025-11-20T09:30:00+08:00'));
entries.push(buildObservation(patientRef, '2093-3',  'LDL Cholesterol', 149,  'mg/dL','2025-10-25T10:05:00+08:00'));

// Vitals (19 time points, 4-hour intervals going back 72h)
const vitalLoinc = [
  { code: '8310-5', display: 'Body temperature',   key: 'Temp',  unit: 'Cel'  },
  { code: '8867-4', display: 'Heart rate',          key: 'Pulse', unit: '/min' },
  { code: '9279-1', display: 'Respiratory rate',    key: 'Resp',  unit: '/min' },
  { code: '8480-6', display: 'Systolic BP',         key: 'SBP',   unit: 'mmHg' },
  { code: '8462-4', display: 'Diastolic BP',        key: 'DBP',   unit: 'mmHg' },
  { code: '59408-5',display: 'Oxygen saturation',   key: 'SpO2',  unit: '%'    },
];

for (let i = 0; i < 19; i++) {
  const h = 72 - i * 4;
  const effectiveDateTime = new Date(Date.now() - h * 3600 * 1000).toISOString();
  const vals = {
    Temp:  +(36.6 + Math.sin(i * 0.5) * 0.45 + (i === 9 ? 0.6 : 0)).toFixed(1),
    Pulse: Math.round(80 + Math.sin(i * 0.35) * 9 + (i === 9 ? 8 : 0)),
    Resp:  Math.round(16 + Math.sin(i * 0.4) * 2),
    SBP:   Math.round(138 + Math.sin(i * 0.22) * 11 + (i > 14 ? 8 : 0)),
    DBP:   Math.round(85 + Math.sin(i * 0.3) * 6),
    SpO2:  +(97 + Math.sin(i * 0.15) * 0.9).toFixed(0),
  };
  for (const v of vitalLoinc) {
    entries.push(buildVitalObservation(patientRef, v.code, v.display, vals[v.key], v.unit, effectiveDateTime));
  }
}

// MedicationRequests
entries.push(buildMedicationRequest(patientRef, 'Metformin',    '500mg',   'QD',  'PO', 'HbA1c / Glucose AC'));
entries.push(buildMedicationRequest(patientRef, 'Januvia',      '100mg',   'QD',  'PO', 'HbA1c / Glucose AC'));
entries.push(buildMedicationRequest(patientRef, 'Insulin Glargine', '10 units', 'QHS', 'SC', 'Glucose AC'));
entries.push(buildMedicationRequest(patientRef, 'Lisinopril',   '10mg',    'QD',  'PO', 'Systolic BP / K+'));
entries.push(buildMedicationRequest(patientRef, 'Atorvastatin', '10mg',    'QD',  'PO', 'LDL Cholesterol'));

// MedicationAdministrations
entries.push(buildMedAdministration(patientRef, '12/24 13:12', '1 tablet', 'RN 林'));
entries.push(buildMedAdministration(patientRef, '12/23 13:12', '1 tablet', 'RN 陳'));
entries.push(buildMedAdministration(patientRef, '12/22 13:12', '1 tablet', 'RN 林'));

// DiagnosticReports
entries.push(buildDiagnosticReport(patientRef, '檢驗報告 (5 項)', 'LAB', '2025-12-24T13:12:00+08:00',
  ['Glucose AC — 185 mg/dL ▲', 'Creatinine — 1.1 mg/dL', 'Systolic BP — 152 mmHg ▲', 'HbA1c — 7.3 %', 'LDL Cholesterol — 138 mg/dL ▲']));
entries.push(buildDiagnosticReport(patientRef, '影像報告 — Chest X-Ray', 'RAD', '2025-12-24T13:12:00+08:00',
  ['心肺輪廓正常，無浸潤或肋膜積水。', 'Impression: No acute cardiopulmonary process.']));
entries.push(buildDiagnosticReport(patientRef, '檢驗報告 — HbA1c', 'LAB', '2025-11-20T09:30:00+08:00',
  ['HbA1c — 7.4 % (前次 7.6 %)']));
entries.push(buildDiagnosticReport(patientRef, '檢驗報告 — LDL Cholesterol', 'LAB', '2025-10-25T10:05:00+08:00',
  ['LDL — 149 mg/dL ▲']));

const bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: entries,
};

// ── POST 到 HAPI FHIR ───────────────────────────────────────────────────────

console.log(`\n🌐 FHIR target: ${FHIR_BASE}`);
console.log(`📦 Bundle entries: ${entries.length}`);
console.log('⏳ Posting transaction bundle...\n');

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

// 從 response Bundle 取 Patient 的伺服器分配 ID
const patientEntry = responseBundle.entry?.find(e =>
  e.response?.location?.startsWith('Patient/')
);
const serverPatientId = patientEntry?.response?.location
  ?.replace('Patient/', '').split('/')[0] ?? patientEntry?.response?.location?.split('/')[1];

if (!serverPatientId) {
  console.error('⚠️  無法從 response 取得 Patient ID，請手動查詢：');
  console.error(`  GET ${FHIR_BASE}/Patient?identifier=A123456789`);
  console.log('\nResponse Bundle (前 3 entries):');
  console.log(JSON.stringify(responseBundle.entry?.slice(0, 3), null, 2));
  process.exit(1);
}

console.log('✅ Seed 完成！');
console.log(`\n👤 Patient ID: ${serverPatientId}`);
console.log(`\n🚀 Dev Login URL（點擊或複製到瀏覽器）：`);
console.log(`\n   ${APP_BASE}/api/auth/dev-login?fhirBase=${encodeURIComponent(FHIR_BASE)}&patientId=${serverPatientId}\n`);
