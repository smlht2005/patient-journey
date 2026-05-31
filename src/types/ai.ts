/**
 * ⑤ AI 服務層型別定義
 * 涵蓋：語音轉 FHIR、AI 智慧摘要、AI 對話
 */

// ── 語音轉 FHIR 醫囑 ──────────────────────────────────────────────────────

export interface VoiceOrderRequest {
  text: string;              // 語音 STT 結果或直接文字輸入
  patientId: string;
  patientName?: string;
  encounterId?: string;
  requesterId?: string;      // Practitioner id
}

export interface VoiceOrderResponse {
  success: boolean;
  fhirDraft?: FhirMedicationRequest;
  parsedIntent?: ParsedMedIntent;
  confidence: number;        // 0–1，模型解析信心度
  warnings?: string[];       // 解析不確定的部分
  error?: string;
}

export interface ParsedMedIntent {
  drugName: string;
  genericName?: string;
  rxnormCode?: string;
  dose?: string;
  unit?: string;
  route?: string;
  frequency?: string;
  duration?: string;
  indication?: string;
  priority?: 'stat' | 'urgent' | 'routine';
}

export interface FhirMedicationRequest {
  resourceType: 'MedicationRequest';
  status: 'draft';
  intent: 'order';
  priority?: 'stat' | 'urgent' | 'routine';
  medicationCodeableConcept: {
    coding?: Array<{ system: string; code?: string; display: string }>;
    text: string;
  };
  subject: { reference: string; display?: string };
  dosageInstruction: Array<{
    text: string;
    route?: { coding: Array<{ display: string }> };
    timing?: { code?: { text: string }; repeat?: object };
    doseAndRate?: Array<{ doseQuantity: { value: number; unit: string } }>;
  }>;
  reasonCode?: Array<{ text: string }>;
  note?: Array<{ text: string }>;
  meta: { profile: string[] };
}

// ── AI 智慧摘要 ────────────────────────────────────────────────────────────

export interface SummarizeRequest {
  patientId: string;
  patientName: string;
  observations: Array<{ display: string; value: number; unit: string; time: string; status: string }>;
  medications: Array<{ name: string; dose: string; freq: string; route: string }>;
  alerts: Array<{ title: string; level: string }>;
  admitDate?: string;
  mode?: 'handoff' | 'rounds' | 'brief';  // 交班 / 查房 / 快速摘要
}

export interface SummarizeResponse {
  summary: string;           // Markdown 格式
  keyFindings: string[];     // 條列重點
  followUpItems: string[];   // 追蹤事項
  riskLevel: 'low' | 'moderate' | 'high';
  generatedAt: string;
}

// ── AI 對話 ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  patientContext?: {
    patientId: string;
    patientName: string;
    activeAlerts: string[];
    keyLabs: string;
  };
  stream?: boolean;
}

export interface ChatResponse {
  reply: string;
  tokensUsed?: number;
}
