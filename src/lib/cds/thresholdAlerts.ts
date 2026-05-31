/**
 * 生理數值 / 檢驗閾值警示引擎 (Threshold Alert Engine)
 * 
 * 安全加固：修正 _time 比較 bug（原用 spread 附加導致 undefined）
 * 改用獨立 timeMap 追蹤各 LOINC 最新時間。
 */
import { CdsCard } from '@/types/cds';

export interface ThresholdRule {
  loinc: string;
  display: string;
  unit: string;
  warnAbove?: number;
  criticalAbove?: number;
  warnBelow?: number;
  criticalBelow?: number;
  suggestion: string;
}

export const THRESHOLD_RULES: ThresholdRule[] = [
  { loinc: '2345-7',  display: 'Glucose AC',       unit: 'mg/dL',  warnAbove: 180,  criticalAbove: 300,
    suggestion: '建議評估胰島素劑量，檢查用藥順從性及飲食控制。' },
  { loinc: '2093-3',  display: 'LDL Cholesterol',   unit: 'mg/dL',  warnAbove: 130,  criticalAbove: 190,
    suggestion: '建議強化 Statin 治療，評估飲食調整，目標 LDL < 100 mg/dL（高風險 < 70）。' },
  { loinc: '8480-6',  display: '收縮壓 (SBP)',        unit: 'mmHg',   warnAbove: 140,  criticalAbove: 180,
    suggestion: '建議評估降壓藥物控制情況，若 SBP > 180 mmHg 視為高血壓急症，應立即處理。' },
  { loinc: '8462-4',  display: '舒張壓 (DBP)',        unit: 'mmHg',   warnAbove: 90,   criticalAbove: 120,
    suggestion: '建議調整降壓藥物劑量，評估是否需要加藥。' },
  { loinc: '4548-4',  display: 'HbA1c',              unit: '%',       warnAbove: 7.0,  criticalAbove: 9.0,
    suggestion: 'HbA1c 未達目標 (<7.0%)，建議評估口服降血糖藥物或胰島素調整方案。' },
  { loinc: '38483-4', display: 'Creatinine',          unit: 'mg/dL',  warnAbove: 1.3,  criticalAbove: 2.0,
    suggestion: '腎功能異常，建議計算 eGFR，評估 Metformin 及 ACEI 劑量是否需要調整。' },
  { loinc: '2823-3',  display: 'Potassium (K+)',       unit: 'mEq/L',  warnAbove: 5.0,  criticalAbove: 6.0,
    warnBelow: 3.5, criticalBelow: 3.0,
    suggestion: '血鉀異常，評估保鉀 / 排鉀藥物，必要時補充 KCl 或調整 ACEI / 利尿劑。' },
  { loinc: '59408-5', display: 'SpO2',                unit: '%',       warnBelow: 94,   criticalBelow: 90,
    suggestion: '血氧偏低，評估呼吸狀況，考慮補充氧氣或進一步影像學檢查。' },
];

interface LatestObs { loinc: string; value: number; unit: string }

/**
 * 從 FHIR Observation[] 取各 LOINC 最新數值
 * 修正：使用獨立 timeMap 避免 spread _time 屬性在 TypeScript 中為 undefined 的 bug
 */
export function extractLatestValues(observations: any[]): LatestObs[] {
  const valueMap = new Map<string, LatestObs>();
  const timeMap  = new Map<string, string>(); // loinc → effectiveDateTime

  for (const r of observations) {
    if (r.resourceType !== 'Observation') continue;
    const loinc = r.code?.coding?.find((c: any) => c.system?.includes('loinc'))?.code ?? '';
    if (!loinc) continue;
    const value = r.valueQuantity?.value ?? r.component?.[0]?.valueQuantity?.value;
    if (value === undefined) continue;
    const unit = r.valueQuantity?.unit ?? '';
    const time = r.effectiveDateTime ?? r.issued ?? '';
    const prevTime = timeMap.get(loinc) ?? '';
    if (!prevTime || time > prevTime) {
      valueMap.set(loinc, { loinc, value, unit });
      timeMap.set(loinc, time);
    }
  }
  return Array.from(valueMap.values());
}

export function buildThresholdCards(observations: any[]): CdsCard[] {
  const latest = extractLatestValues(observations);
  const cards: CdsCard[] = [];

  for (const rule of THRESHOLD_RULES) {
    const obs = latest.find(o => o.loinc === rule.loinc);
    if (!obs) continue;
    const { value } = obs;

    let indicator: 'critical' | 'warning' | null = null;
    let label = '';

    if (rule.criticalAbove !== undefined && value > rule.criticalAbove) {
      indicator = 'critical'; label = `危急高值 ${value} ${rule.unit}`;
    } else if (rule.warnAbove !== undefined && value > rule.warnAbove) {
      indicator = 'warning';  label = `偏高 ${value} ${rule.unit}`;
    } else if (rule.criticalBelow !== undefined && value < rule.criticalBelow) {
      indicator = 'critical'; label = `危急低值 ${value} ${rule.unit}`;
    } else if (rule.warnBelow !== undefined && value < rule.warnBelow) {
      indicator = 'warning';  label = `偏低 ${value} ${rule.unit}`;
    }

    if (!indicator) continue;

    cards.push({
      uuid: `threshold-${rule.loinc}-${Date.now()}`,
      summary: `${rule.display} ${label}`,
      detail: `最新數值：**${value} ${rule.unit}**\n\n${rule.suggestion}`,
      indicator,
      source: {
        label: 'Patient Journey CDS — 閾值監控',
        topic: { system: 'http://loinc.org', code: rule.loinc, display: rule.display },
      },
      suggestions: [
        { label: '確認已知悉', uuid: `ack-${rule.loinc}`, isRecommended: false },
        { label: '開立相關檢驗追蹤', isRecommended: true },
      ],
      overrideReasons: [
        { code: { code: 'reason-patient-condition', system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', display: '病人特殊臨床情況' } },
        { code: { code: 'reason-already-managed',   system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', display: '已有處置計畫' } },
      ],
    });
  }
  return cards;
}
