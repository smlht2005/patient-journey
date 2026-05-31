// ③ FHIR → ViewModel 映射層（佔位 / placeholder）
// 下一階段 /tasks ③ 將把 HAPI FHIR resource 映射為前端 ViewModel。
// 目前僅定義介面與 TODO，使前端可漸進切換。

export interface PatientVM {
  name: string; age: number; sex: string; mrn: string;
  bed: string; attending: string; admit: string; code: string; allergy: string;
}

export interface ObservationVM { code: string; value: number; unit: string; time: string; }

// TODO(③): mapPatient(fhir: fhir4.Patient): PatientVM
export function mapPatient(_resource: unknown): PatientVM {
  throw new Error('NOT_IMPLEMENTED: 由 /tasks ③ FHIR 映射階段實作');
}

// TODO(③): mapObservation(fhir: fhir4.Observation): ObservationVM
export function mapObservation(_resource: unknown): ObservationVM {
  throw new Error('NOT_IMPLEMENTED: 由 /tasks ③ FHIR 映射階段實作');
}
