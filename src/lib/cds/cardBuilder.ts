/**
 * CDS Card 組裝器
 * 統一 DDI + 閾值 + AI 建議，依嚴重度排序，
 * 並限制最大 card 數量避免 UI 過載。
 */

import { CdsCard, CdsHookRequest, CdsHookResponse } from '@/types/cds';
import { detectInteractions } from './drugInteractions';
import { buildThresholdCards } from './thresholdAlerts';
import { buildAiSuggestionCards } from './aiSuggestions';

const SOURCE_BASE = {
  label: 'Patient Journey CDS Service',
  url: 'https://github.com/smlht2005/patient-journey',
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/** DDI 規則 → CDS Cards */
function buildDdiCards(draftOrders: any[]): CdsCard[] {
  return detectInteractions(draftOrders).map(ddi => ({
    uuid: ddi.id,
    summary: ddi.summary,
    detail: `${ddi.detail}\n\n**建議處置：** ${ddi.managementSuggestion}`,
    indicator: ddi.severity,
    source: {
      ...SOURCE_BASE,
      topic: { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: ddi.id, display: 'Drug Interaction' },
    },
    suggestions: [
      { label: '移除交互作用藥品', isRecommended: true },
      { label: '確認已知悉風險並繼續', isRecommended: false },
    ],
    overrideReasons: [
      { code: { code: 'patient-refused', system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', display: '病人拒絕替代方案' } },
      { code: { code: 'clinical-judgment', system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason', display: '臨床判斷下必要' } },
    ],
    ...(ddi.reference ? { links: [{ label: '參考文獻', url: ddi.reference, type: 'absolute' as const }] } : {}),
  }));
}

/**
 * 主處理函式：給定 CDS Hook 請求，回傳完整 CdsHookResponse
 * order-select：DDI + AI 建議
 * order-sign：DDI + 閾值 + AI 建議（全套）
 */
export function processCdsRequest(
  req: CdsHookRequest,
  prefetchObservations: any[] = [],
): CdsHookResponse {
  const context = req.context as any;
  const draftOrders: any[] = context.draftOrders?.entry?.map((e: any) => e.resource) ?? [];

  const cards: CdsCard[] = [];

  // 1. DDI（order-select & order-sign 都跑）
  cards.push(...buildDdiCards(draftOrders));

  // 2. 閾值警示（order-sign 才全跑，order-select 只跑 critical）
  const thresholdCards = buildThresholdCards(prefetchObservations);
  if (req.hook === 'order-sign') {
    cards.push(...thresholdCards);
  } else {
    cards.push(...thresholdCards.filter(c => c.indicator === 'critical'));
  }

  // 3. AI 預判（全鉤點都跑）
  cards.push(...buildAiSuggestionCards(draftOrders, prefetchObservations));

  // 排序：critical → warning → info，同級依 summary 字母
  cards.sort((a, b) =>
    SEVERITY_ORDER[a.indicator] - SEVERITY_ORDER[b.indicator] ||
    a.summary.localeCompare(b.summary)
  );

  // 限制最多 8 張（避免 alert fatigue）
  return { cards: cards.slice(0, 8) };
}
