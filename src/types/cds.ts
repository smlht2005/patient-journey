/**
 * CDS Hooks 標準型別定義
 * 規範參考：https://cds-hooks.hl7.org/2.0/
 * TW Core 擴充：SMART on FHIR context 帶入 patient/encounter
 */

// ── Hook Request ────────────────────────────────────────────────────────────

export interface CdsHookRequest {
  hookInstance: string;          // UUID，每次呼叫唯一
  hook: 'order-select' | 'order-sign' | 'patient-view';
  context: OrderSelectContext | OrderSignContext | PatientViewContext;
  prefetch?: Record<string, FhirResource>;
  fhirServer?: string;
  fhirAuthorization?: { access_token: string; token_type: string; expires_in: number; scope: string; subject: string };
}

export interface OrderSelectContext {
  userId: string;                // 開立醫師 (Practitioner/{id})
  patientId: string;
  encounterId?: string;
  selections: string[];          // 當下選中的 draft MedicationRequest ids
  draftOrders: FhirBundle;       // 含所有 draft MedicationRequest
}

export interface OrderSignContext extends OrderSelectContext {
  // order-sign 與 order-select context 結構相同，語意為「即將簽署」
}

export interface PatientViewContext {
  userId: string;
  patientId: string;
  encounterId?: string;
}

// ── Hook Response ───────────────────────────────────────────────────────────

export interface CdsHookResponse {
  cards: CdsCard[];
  systemActions?: CdsAction[];
}

export interface CdsCard {
  uuid?: string;
  summary: string;               // 標題（≤140 字）
  detail?: string;               // Markdown 說明
  indicator: 'info' | 'warning' | 'critical';
  source: CdsSource;
  suggestions?: CdsSuggestion[];
  selectionBehavior?: 'at-most-one' | 'any';
  overrideReasons?: CdsOverrideReason[];
  links?: CdsLink[];
}

export interface CdsSource {
  label: string;
  url?: string;
  icon?: string;
  topic?: { code: string; display: string; system: string };
}

export interface CdsSuggestion {
  label: string;
  uuid?: string;
  isRecommended?: boolean;
  actions?: CdsAction[];
}

export interface CdsAction {
  type: 'create' | 'update' | 'delete';
  description: string;
  resource?: FhirResource;
  resourceId?: string[];
}

export interface CdsOverrideReason {
  code: { code: string; system: string; display: string };
  userSelectedItem?: { code: string; display: string; system: string };
}

export interface CdsLink {
  label: string;
  url: string;
  type: 'absolute' | 'smart';
  appContext?: string;
}

// ── Discovery ────────────────────────────────────────────────────────────────

export interface CdsServiceDefinition {
  hook: string;
  title: string;
  description: string;
  id: string;
  prefetch?: Record<string, string>;
  usageRequirements?: string;
}

export interface CdsDiscoveryResponse {
  services: CdsServiceDefinition[];
}

// ── 簡化 FHIR 型別（避免引入 @types/fhir 的完整依賴） ────────────────────

export interface FhirResource { resourceType: string; id?: string; [key: string]: any; }
export interface FhirBundle { resourceType: 'Bundle'; entry?: { resource: FhirResource }[]; }
