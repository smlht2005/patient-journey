/**
 * 語音 / 文字 → FHIR MedicationRequest 解析器
 * 
 * 使用 Claude claude-sonnet-4-20250514 理解自然語言醫囑，
 * 輸出符合 FHIR TW Core MedicationRequest profile 的草稿。
 * 
 * 支援中文、英文、混合語言醫囑輸入。
 */

import { callClaude, safeParseJson } from './claudeClient';
import {
  VoiceOrderRequest, VoiceOrderResponse,
  ParsedMedIntent, FhirMedicationRequest,
} from '@/types/ai';

const ROUTE_MAP: Record<string, string> = {
  'iv': 'Intravenous', 'iv push': 'IV Push', 'ivp': 'IV Push',
  'po': 'Oral', '口服': 'Oral',
  'sc': 'Subcutaneous', '皮下': 'Subcutaneous',
  'im': 'Intramuscular', '肌肉': 'Intramuscular',
  'sl': 'Sublingual', '舌下': 'Sublingual',
  'pr': 'Rectal', '肛門': 'Rectal',
  'top': 'Topical', '外用': 'Topical',
  'inh': 'Inhalation', '吸入': 'Inhalation',
};

const FREQ_MAP: Record<string, string> = {
  'qd': 'QD (每日一次)', 'od': 'QD (每日一次)', '每天': 'QD',
  'bid': 'BID (每日兩次)', '每天兩次': 'BID',
  'tid': 'TID (每日三次)', '每天三次': 'TID',
  'qid': 'QID (每日四次)',
  'q4h': 'Q4H (每4小時)',  'q6h': 'Q6H (每6小時)',
  'q8h': 'Q8H (每8小時)',  'q12h': 'Q12H (每12小時)',
  'prn': 'PRN (需要時)', '需要時': 'PRN',
  'stat': 'STAT (立即)', '立即': 'STAT', '馬上': 'STAT',
  'qhs': 'QHS (睡前)',  '睡前': 'QHS',
  'qam': 'QAM (早晨)',  '早上': 'QAM',
};

const SYSTEM_PROMPT = `你是一個醫療資訊系統 AI，專門將醫師的自然語言醫囑（中文、英文或混合）解析為結構化 JSON。

規則：
1. 僅輸出合法 JSON，不加任何說明、不用 markdown fence。
2. 若無法確定某欄位，設為 null。
3. drugName 使用品牌名，genericName 使用學名。
4. priority: "stat"=立即/STAT, "urgent"=急, "routine"=常規（預設）。
5. route 使用英文縮寫：PO/IV/SC/IM/SL/PR/TOP/INH。
6. frequency 使用標準縮寫：QD/BID/TID/QID/Q4H/Q6H/Q8H/Q12H/PRN/STAT/QHS。
7. indication 填寫開藥原因（從語境推斷）。
8. confidence 0–1，代表解析確信度。
9. warnings 列出不確定或需醫師確認的項目。

輸出格式：
{
  "drugName": "...",
  "genericName": "...",
  "rxnormCode": "...",
  "dose": "...",
  "unit": "mg|g|mL|units|...",
  "route": "PO|IV|SC|IM|...",
  "frequency": "QD|BID|STAT|...",
  "duration": "...",
  "indication": "...",
  "priority": "routine|urgent|stat",
  "confidence": 0.95,
  "warnings": []
}`;

function buildFhirDraft(
  intent: ParsedMedIntent,
  req: VoiceOrderRequest,
): FhirMedicationRequest {
  const routeDisplay = ROUTE_MAP[intent.route?.toLowerCase() ?? ''] ?? intent.route ?? 'Oral';
  const freqDisplay = FREQ_MAP[intent.frequency?.toLowerCase() ?? ''] ?? intent.frequency ?? 'QD';
  const doseText = `${intent.dose ?? ''}${intent.unit ? ' ' + intent.unit : ''}`.trim();
  const fullSig = [doseText, routeDisplay, freqDisplay, intent.duration].filter(Boolean).join(', ');

  return {
    resourceType: 'MedicationRequest',
    status: 'draft',
    intent: 'order',
    priority: intent.priority ?? 'routine',
    medicationCodeableConcept: {
      coding: intent.rxnormCode ? [{
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: intent.rxnormCode,
        display: intent.genericName ?? intent.drugName,
      }] : undefined,
      text: intent.dose
        ? `${intent.drugName} ${doseText}`
        : intent.drugName,
    },
    subject: {
      reference: `Patient/${req.patientId}`,
      display: req.patientName,
    },
    dosageInstruction: [{
      text: fullSig || intent.drugName,
      route: { coding: [{ display: routeDisplay }] },
      timing: freqDisplay ? { code: { text: freqDisplay } } : undefined,
      doseAndRate: intent.dose && !isNaN(Number(intent.dose)) ? [{
        doseQuantity: {
          value: Number(intent.dose),
          unit: intent.unit ?? 'mg',
        },
      }] : undefined,
    }],
    reasonCode: intent.indication ? [{ text: intent.indication }] : undefined,
    note: [{ text: `語音醫囑原文：${req.text}` }],
    meta: {
      profile: ['https://twcore.mohw.gov.tw/ig/twcore/StructureDefinition/MedicationRequest-twcore'],
    },
  };
}

export async function parseVoiceOrder(
  req: VoiceOrderRequest,
): Promise<VoiceOrderResponse> {
  try {
    const rawText = await callClaude({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `醫囑內容：「${req.text}」` }],
      maxTokens: 600,
      temperature: 0.1,
    });

    const intent = safeParseJson<ParsedMedIntent & { confidence: number; warnings: string[] }>(rawText);

    if (!intent || !intent.drugName) {
      return {
        success: false,
        confidence: 0,
        error: `無法解析醫囑，請重新描述。Claude 回應：${rawText.slice(0, 200)}`,
      };
    }

    const { confidence = 0.8, warnings = [], ...medIntent } = intent;
    const fhirDraft = buildFhirDraft(medIntent, req);

    return { success: true, fhirDraft, parsedIntent: medIntent, confidence, warnings };

  } catch (err) {
    return { success: false, confidence: 0, error: (err as Error).message };
  }
}
