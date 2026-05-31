/**
 * 離線 / 未授權 fallback — 模擬 FHIR TW Core 結構的 PatientSummaryVM
 * 無任何真實病人個資（POC 展示用）
 */
import { PatientSummaryVM } from '@/types/viewmodels';

export const MOCK_SUMMARY: PatientSummaryVM = {
  patient: {
    name: '陳大明', age: 46, sex: '男性', mrn: 'A123456789',
    bed: '5B-12', attending: '王小明 醫師', admit: '2025-09-25',
    code: 'Full Code', allergy: '對盤尼西林過敏 (NKA)',
  },
  vitals: Array.from({ length: 19 }, (_, i) => {
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
  }),
  observations: [
    { code: '4548-4',  display: 'HbA1c',          value: 7.3,  unit: '%',    time: '2025-12-24T13:12:00', status: 'normal'  },
    { code: '2093-3',  display: 'LDL Cholesterol', value: 138,  unit: 'mg/dL',time: '2025-12-24T13:12:00', status: 'warning' },
    { code: '2345-7',  display: 'Glucose AC',      value: 185,  unit: 'mg/dL',time: '2025-12-24T13:12:00', status: 'warning' },
    { code: '38483-4', display: 'Creatinine',      value: 1.1,  unit: 'mg/dL',time: '2025-12-24T13:12:00', status: 'normal'  },
    { code: '8480-6',  display: 'Systolic BP',     value: 152,  unit: 'mmHg', time: '2025-12-24T13:12:00', status: 'warning' },
  ],
  medications: [
    { id: 'metformin',    name: 'Metformin 500mg',    dose: '1 tablet', freq: 'QD',  route: 'PO', lab: 'HbA1c / Glucose AC' },
    { id: 'januvia',      name: 'Januvia 100mg',      dose: '1 tablet', freq: 'QD',  route: 'PO', lab: 'HbA1c / Glucose AC' },
    { id: 'insulin',      name: 'Insulin Glargine',   dose: '10 units', freq: 'QHS', route: 'SC', lab: 'Glucose AC' },
    { id: 'lisinopril',   name: 'Lisinopril 10mg',    dose: '1 tablet', freq: 'QD',  route: 'PO', lab: 'Systolic BP / K+' },
    { id: 'atorvastatin', name: 'Atorvastatin 10mg',  dose: '1 tablet', freq: 'QD',  route: 'PO', lab: 'LDL Cholesterol' },
  ],
  journey: [
    { id: 'j1', type: 'lab',   time: '2025/12/24 13:12', title: '檢驗報告 (5 項)',           detail: ['Glucose AC — 185 mg/dL ▲','Creatinine — 1.1 mg/dL','Systolic BP — 152 mmHg ▲','HbA1c — 7.3 %','LDL Cholesterol — 138 mg/dL ▲'], flag: 'warning' },
    { id: 'j2', type: 'image', time: '2025/12/24 13:12', title: '影像報告 — Chest X-Ray',    detail: ['心肺輪廓正常，無浸潤或肋膜積水。','Impression: No acute cardiopulmonary process.'], flag: 'normal' },
    { id: 'j3', type: 'med',   time: '2025/12/17 13:12', title: '新增用藥 (5 項)',           detail: ['Metformin 500mg — 1 tablet','Januvia 100mg — 1 tablet','Insulin Glargine — 10 units','Lisinopril 10mg — 1 tablet','Atorvastatin 10mg — 1 tablet'], flag: 'info' },
    { id: 'j4', type: 'lab',   time: '2025/11/20 09:30', title: '檢驗報告 — HbA1c',          detail: ['HbA1c — 7.4 % (前次 7.6 %)'], flag: 'normal' },
    { id: 'j5', type: 'lab',   time: '2025/10/25 10:05', title: '檢驗報告 — LDL Cholesterol',detail: ['LDL — 149 mg/dL ▲'], flag: 'warning' },
  ],
  adherence: [
    { ts: '12/24 13:12', dose: '1 tablet', giver: 'RN 林', ok: true },
    { ts: '12/23 13:12', dose: '1 tablet', giver: 'RN 陳', ok: true },
    { ts: '12/22 13:12', dose: '1 tablet', giver: 'RN 林', ok: true },
  ],
  radar: [
    { dim: '血壓', v: 62 }, { dim: '心率', v: 84 }, { dim: '肝功能', v: 90 },
    { dim: '呼吸', v: 92 }, { dim: '感染', v: 74 }, { dim: '凝血', v: 58 },
  ],
  alerts: [
    { id: 'a2', level: 'warning', title: '高血壓警示',    body: '收縮壓 152 mmHg 超出安全範圍，建議評估控制情況。', tag: 'SBP > 140' },
    { id: 'a3', level: 'warning', title: '高血糖警示',    body: '血糖 185 mg/dL 高於 180 mg/dL，建議評估糖尿病控制情況。', tag: 'Glucose > 180' },
    { id: 'a4', level: 'warning', title: '高 LDL 警示',  body: 'LDL 138 mg/dL 超過 130 mg/dL，建議調整飲食與用藥。', tag: 'LDL > 130' },
  ],
};
