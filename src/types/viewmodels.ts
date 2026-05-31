// ③ 前端 ViewModel 型別
// 由 FHIR TW Core resource 映射而來，與 FHIR 結構解耦

export interface PatientVM {
  name: string;
  age: number;
  sex: string;
  mrn: string;
  bed: string;
  attending: string;
  admit: string;
  code: string;
  allergy: string;
}

export interface ObservationVM {
  code: string;       // LOINC display / local code
  display: string;    // 中文名稱
  value: number;
  unit: string;
  time: string;       // ISO 8601
  status: 'normal' | 'warning' | 'critical';
}

export interface VitalSignVM {
  t: string;          // label for chart x-axis
  Temp?: number;
  Pulse?: number;
  Resp?: number;
  SBP?: number;
  DBP?: number;
  SpO2?: number;
}

export interface MedicationVM {
  id: string;
  name: string;
  dose: string;
  freq: string;
  route: string;
  lab: string;        // 關聯檢驗項目（用於療效疊圖）
  startDate?: string;
}

export interface JourneyEventVM {
  id: string;
  type: 'lab' | 'image' | 'med' | 'note';
  time: string;
  title: string;
  detail: string[];
  flag: 'normal' | 'warning' | 'danger' | 'info';
}

export interface AdherenceVM {
  ts: string;
  dose: string;
  giver: string;
  ok: boolean;
}

export interface RadarVM {
  dim: string;
  v: number;
}

export interface AlertVM {
  id: string;
  level: 'danger' | 'warning' | 'info';
  title: string;
  body: string;
  tag: string;
}

// 聚合型：BFF /api/patient-summary 回傳的完整 ViewModel
export interface PatientSummaryVM {
  patient: PatientVM;
  vitals: VitalSignVM[];
  observations: ObservationVM[];
  medications: MedicationVM[];
  journey: JourneyEventVM[];
  adherence: AdherenceVM[];
  radar: RadarVM[];
  alerts: AlertVM[];
}
