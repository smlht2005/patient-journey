/**
 * AI 預判性臨床建議引擎 (Predictive AI Suggestions)
 * 
 * 依藥品組合 + 最新檢驗值，主動產生預防性提示。
 * 正式部署可替換為 LLM API 呼叫（如 Claude claude-sonnet-4-20250514 / GPT-4o）；
 * 本 POC 以規則式產生，輸出格式與 LLM 版本相容。
 */

import { CdsCard } from '@/types/cds';

interface ClinicalContext {
  medicationNames: string[];   // 當前 active medications (lowercase)
  latestLabs: Record<string, number>; // loinc → value
}

interface AiRule {
  id: string;
  trigger: (ctx: ClinicalContext) => boolean;
  card: (ctx: ClinicalContext) => CdsCard;
}

const AI_RULES: AiRule[] = [
  // Lisinopril 增量前確認 K+
  {
    id: 'ai-lisinopril-potassium',
    trigger: (ctx) => ctx.medicationNames.some(n => n.includes('lisinopril')),
    card: (ctx) => {
      const k = ctx.latestLabs['2823-3'];
      return {
        uuid: 'ai-lisinopril-k',
        summary: 'AI 建議：調整 Lisinopril 前確認血鉀 (K+)',
        detail: k !== undefined
          ? `目前 K+ = **${k} mEq/L**。${k > 4.5 ? '⚠️ 血鉀已偏高，增加 Lisinopril 劑量可能加重高血鉀風險，建議謹慎評估。' : '血鉀在安全範圍內，可依需要調整劑量。'}`
          : `目前無最近 K+ 檢驗紀錄。**建議先確認血鉀濃度**再調整 Lisinopril 劑量，以避免高血鉀 (Hyperkalemia) 風險。`,
        indicator: k !== undefined && k > 5.0 ? 'critical' : k !== undefined && k > 4.5 ? 'warning' : 'info',
        source: { label: 'Patient Journey AI 助理', topic: { system: 'http://loinc.org', code: '2823-3', display: 'Potassium' } },
        suggestions: [
          { label: '開立 K+ 檢驗', isRecommended: true },
          { label: '確認已知悉', isRecommended: false },
        ],
      };
    },
  },

  // Metformin + 腎功能異常
  {
    id: 'ai-metformin-renal',
    trigger: (ctx) => {
      const hasMetformin = ctx.medicationNames.some(n => n.includes('metformin'));
      const creat = ctx.latestLabs['38483-4'];
      return hasMetformin && creat !== undefined && creat > 1.3;
    },
    card: (ctx) => {
      const creat = ctx.latestLabs['38483-4'] ?? '?';
      return {
        uuid: 'ai-metformin-renal',
        summary: 'AI 建議：Metformin 使用於腎功能異常病患',
        detail: `目前 Creatinine = **${creat} mg/dL**，eGFR 可能低於 45 mL/min/1.73m²。\n\nMetformin 禁用於 eGFR < 30；eGFR 30–45 需減量並密切監測。建議計算最新 eGFR。`,
        indicator: 'warning',
        source: { label: 'Patient Journey AI 助理' },
        suggestions: [
          { label: '計算 eGFR（CKD-EPI 公式）', isRecommended: true },
          { label: '評估 Metformin 劑量調整', isRecommended: true },
        ],
      };
    },
  },

  // HbA1c 未達標，建議強化治療
  {
    id: 'ai-hba1c-target',
    trigger: (ctx) => {
      const hba1c = ctx.latestLabs['4548-4'];
      return hba1c !== undefined && hba1c > 7.0;
    },
    card: (ctx) => {
      const hba1c = ctx.latestLabs['4548-4'];
      return {
        uuid: 'ai-hba1c-target',
        summary: `AI 建議：HbA1c ${hba1c}% 未達目標 (<7.0%)`,
        detail: `依 ADA / TW DM 指引，HbA1c 目標 <7.0%（高齡或腎病患者可放寬至 <8.0%）。\n\n建議評估：① 增加 Metformin 劑量 ② 加入 GLP-1RA 或 SGLT2i ③ 胰島素強化療法。`,
        indicator: hba1c! > 9.0 ? 'critical' : 'warning',
        source: { label: 'Patient Journey AI 助理', topic: { system: 'http://loinc.org', code: '4548-4', display: 'HbA1c' } },
        suggestions: [
          { label: '評估強化血糖控制方案', isRecommended: true },
          { label: '安排衛教師糖尿病衛教', isRecommended: false },
        ],
      };
    },
  },

  // Warfarin 未監測 PT/INR
  {
    id: 'ai-warfarin-inr',
    trigger: (ctx) => {
      const hasWarfarin = ctx.medicationNames.some(n => n.includes('warfarin'));
      const hasInr = ctx.latestLabs['5902-2'] !== undefined;
      return hasWarfarin && !hasInr;
    },
    card: () => ({
      uuid: 'ai-warfarin-inr',
      summary: 'AI 建議：Warfarin 使用中，建議確認最近 PT/INR',
      detail: 'Warfarin 抗凝效果需定期以 PT/INR 監測（目標 INR 通常 2.0–3.0）。目前無最近 INR 紀錄，建議安排檢驗。',
      indicator: 'warning',
      source: { label: 'Patient Journey AI 助理' },
      suggestions: [{ label: '開立 PT/INR 檢驗', isRecommended: true }],
    }),
  },
];

/** 依臨床情境產生 AI 預判性 CDS Cards */
export function buildAiSuggestionCards(
  draftOrders: any[],
  observations: any[],
): CdsCard[] {
  // 建立情境
  const medicationNames: string[] = draftOrders
    .filter((r: any) => r.resourceType === 'MedicationRequest')
    .map((r: any) => (
      r.medicationCodeableConcept?.text ??
      r.medicationCodeableConcept?.coding?.[0]?.display ?? ''
    ).toLowerCase());

  const latestLabs: Record<string, number> = {};
  for (const r of observations) {
    if (r.resourceType !== 'Observation') continue;
    const loinc = r.code?.coding?.find((c: any) => c.system?.includes('loinc'))?.code;
    const value = r.valueQuantity?.value;
    if (loinc && value !== undefined) latestLabs[loinc] = value;
  }

  const ctx: ClinicalContext = { medicationNames, latestLabs };
  return AI_RULES
    .filter(rule => rule.trigger(ctx))
    .map(rule => rule.card(ctx));
}
