/**
 * 藥物交互作用知識庫 (Drug-Drug Interaction Engine)
 * 
 * 正式部署應對接 NDF-RT / DrugBank / TWDI 資料庫；
 * 本 POC 以靜態規則表實作，結構可直接替換為外部 API 呼叫。
 * 
 * 嚴重度分級（對應 CDS Card indicator）：
 *   critical  → 禁忌 / 嚴重出血 / 心律不整風險
 *   warning   → 需監測 / 建議調整劑量
 *   info      → 輕微，告知即可
 */

export interface DrugInteraction {
  id: string;
  drugs: string[];           // 藥品名稱關鍵字（toLowerCase 比對）
  rxnormA?: string;
  rxnormB?: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  detail: string;
  managementSuggestion: string;
  reference?: string;
}

export const DDI_RULES: DrugInteraction[] = [
  {
    id: 'ddi-warfarin-aspirin',
    drugs: ['warfarin', 'aspirin'],
    rxnormA: '11289', rxnormB: '1191',
    severity: 'critical',
    summary: '嚴重交互作用：Warfarin + Aspirin — 出血風險大幅升高',
    detail: 'Warfarin（抗凝血劑）與 Aspirin（抗血小板）併用，會協同抑制凝血機制，顯著增加消化道出血、顱內出血風險。',
    managementSuggestion: '建議評估是否可移除 Aspirin；若必須併用，應降低 Warfarin 劑量並密切監測 PT/INR。',
    reference: 'https://www.drugs.com/drug-interactions/warfarin-with-aspirin.html',
  },
  {
    id: 'ddi-warfarin-nsaid',
    drugs: ['warfarin', 'ibuprofen'],
    severity: 'critical',
    summary: '嚴重交互作用：Warfarin + NSAID — 出血風險',
    detail: 'NSAID 抑制 COX，增加消化道出血風險，並可能置換 Warfarin 蛋白結合位，提高游離藥物濃度。',
    managementSuggestion: '盡量避免併用；必要時改用 Acetaminophen，並加強 PT/INR 監測。',
  },
  {
    id: 'ddi-acei-potassium',
    drugs: ['lisinopril', 'spironolactone'],
    severity: 'warning',
    summary: '警示：ACEI + 保鉀利尿劑 — 高血鉀風險',
    detail: 'Lisinopril（ACEI）與 Spironolactone 均可升高血鉀，併用可能造成致命高血鉀（Hyperkalemia）。',
    managementSuggestion: '開始併用後 1 週內複查血鉀；目標 K+ < 5.0 mEq/L。',
  },
  {
    id: 'ddi-metformin-contrast',
    drugs: ['metformin', 'contrast'],
    severity: 'warning',
    summary: '警示：Metformin + 碘造影劑 — 乳酸酸中毒風險',
    detail: '碘造影劑可短暫降低腎功能，導致 Metformin 蓄積，增加乳酸酸中毒風險。',
    managementSuggestion: '造影前 48 小時停用 Metformin，造影後確認 eGFR 正常後再恢復。',
  },
  {
    id: 'ddi-statin-fibrate',
    drugs: ['atorvastatin', 'fenofibrate'],
    severity: 'warning',
    summary: '警示：Statin + Fibrate — 肌肉病變風險',
    detail: 'Statin 與 Fibrate 併用可增加橫紋肌溶解症（Rhabdomyolysis）風險，尤其在高劑量 Statin 時。',
    managementSuggestion: '監測 CK 值；若 CK > 10x ULN，立即停藥並評估腎功能。',
  },
  {
    id: 'ddi-ssri-warfarin',
    drugs: ['warfarin', 'sertraline'],
    severity: 'warning',
    summary: '警示：SSRI + Warfarin — 出血風險上升',
    detail: 'SSRI 抑制血小板聚集，與 Warfarin 併用會額外增加出血風險。',
    managementSuggestion: '加強 PT/INR 監測，考慮調整 Warfarin 劑量。',
  },
];

/** 從 MedicationRequest 資源陣列中偵測所有 DDI */
export function detectInteractions(draftOrders: any[]): DrugInteraction[] {
  const names: string[] = draftOrders
    .filter((r: any) => r.resourceType === 'MedicationRequest')
    .map((r: any) => (
      r.medicationCodeableConcept?.text ??
      r.medicationCodeableConcept?.coding?.[0]?.display ?? ''
    ).toLowerCase());

  return DDI_RULES.filter(rule =>
    rule.drugs.every(drug => names.some(n => n.includes(drug)))
  );
}
