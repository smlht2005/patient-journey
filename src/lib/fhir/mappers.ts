/**
 * ③ FHIR TW Core → ViewModel 映射層
 * 
 * 輸入：HAPI FHIR R4 resource (any)
 * 輸出：前端 ViewModel（與 FHIR 結構完全解耦）
 * 
 * LOINC codes 對應 TW Core 常用觀測值：
 *   8310-5  Body temperature
 *   8867-4  Heart rate
 *   9279-1  Respiratory rate
 *   8480-6  Systolic BP
 *   8462-4  Diastolic BP
 *   59408-5 SpO2
 *   4548-4  HbA1c
 *   2093-3  LDL Cholesterol
 *   2345-7  Glucose
 *   38483-4 Creatinine
 */

import {
  PatientVM, ObservationVM, VitalSignVM,
  MedicationVM, JourneyEventVM, AdherenceVM,
  RadarVM, AlertVM, PatientSummaryVM,
} from '@/types/viewmodels';

// ── 工具函式 ────────────────────────────────────────────────────────────────

function calcAge(birthDate: string): number {
  const dob = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function formatDateTime(dt: string): string {
  return dt ? new Date(dt).toLocaleString('zh-TW', { hour12: false }).replace(',', '') : '—';
}

function hasCoding(codings: any[], system: string, code: string): boolean {
  return codings?.some((c: any) => c.system?.includes(system) && c.code === code) ?? false;
}

function getLoincCode(obs: any): string {
  return obs?.code?.coding?.find((c: any) => c.system?.includes('loinc'))?.code ?? '';
}

function getObsValue(obs: any): { value: number; unit: string } {
  if (obs?.valueQuantity) {
    return { value: obs.valueQuantity.value ?? 0, unit: obs.valueQuantity.unit ?? '' };
  }
  // component（血壓 = 兩個 component）
  if (obs?.component?.[0]?.valueQuantity) {
    return { value: obs.component[0].valueQuantity.value, unit: obs.component[0].valueQuantity.unit };
  }
  return { value: 0, unit: '' };
}

// ── 閾值判斷（事件驅動安全警示用） ─────────────────────────────────────────

const THRESHOLDS: Record<string, { warn: number; dir: 'gt' | 'lt'; display: string; unit: string }> = {
  '2345-7':  { warn: 180, dir: 'gt', display: 'Glucose AC', unit: 'mg/dL' },
  '2093-3':  { warn: 130, dir: 'gt', display: 'LDL Cholesterol', unit: 'mg/dL' },
  '8480-6':  { warn: 140, dir: 'gt', display: '收縮壓 SBP', unit: 'mmHg' },
  '8462-4':  { warn: 90,  dir: 'gt', display: '舒張壓 DBP', unit: 'mmHg' },
};

function observationStatus(loinc: string, value: number): 'normal' | 'warning' | 'critical' {
  const t = THRESHOLDS[loinc];
  if (!t) return 'normal';
  const exceeded = t.dir === 'gt' ? value > t.warn : value < t.warn;
  return exceeded ? 'warning' : 'normal';
}

// ── 主映射函式 ───────────────────────────────────────────────────────────────

/** FHIR Patient → PatientVM */
export function mapPatient(r: any): PatientVM {
  const name = r.name?.[0];
  const displayName = name?.text ?? [name?.family, ...(name?.given ?? [])].filter(Boolean).join(' ');
  const allergy = r.extension?.find((e: any) => e.url?.includes('allergy'))?.valueString ?? 'NKA';
  const attending = r.generalPractitioner?.[0]?.display ?? '—';
  const bed = r.extension?.find((e: any) => e.url?.includes('bed'))?.valueString
    ?? r.identifier?.find((i: any) => i.type?.coding?.[0]?.code === 'RN')?.value ?? '—';
  const admit = r.extension?.find((e: any) => e.url?.includes('admitDate'))?.valueDate
    ?? r.meta?.lastUpdated?.slice(0, 10) ?? '—';
  const code = r.extension?.find((e: any) => e.url?.includes('codeStatus'))?.valueString ?? 'Full Code';

  return {
    name: displayName || '(無姓名)',
    age: r.birthDate ? calcAge(r.birthDate) : 0,
    sex: r.gender === 'male' ? '男性' : r.gender === 'female' ? '女性' : '—',
    mrn: r.identifier?.find((i: any) => i.type?.coding?.[0]?.code === 'MR')?.value
      ?? r.id ?? '—',
    bed,
    attending,
    admit,
    code,
    allergy,
  };
}

/** FHIR Observation[] → ObservationVM[] */
export function mapObservations(resources: any[]): ObservationVM[] {
  return resources
    .filter((r: any) => r.resourceType === 'Observation' && r.status !== 'cancelled')
    .map((r: any) => {
      const loinc = getLoincCode(r);
      const { value, unit } = getObsValue(r);
      const display = r.code?.text ?? r.code?.coding?.[0]?.display ?? loinc;
      return {
        code: loinc,
        display,
        value,
        unit,
        time: r.effectiveDateTime ?? r.issued ?? '',
        status: observationStatus(loinc, value),
      };
    });
}

/** FHIR Observation[] (vital signs) → VitalSignVM[] (chart-ready, 72h) */
export function mapVitals(resources: any[]): VitalSignVM[] {
  const LOINC_MAP: Record<string, keyof VitalSignVM> = {
    '8310-5': 'Temp', '8867-4': 'Pulse', '9279-1': 'Resp',
    '8480-6': 'SBP',  '8462-4': 'DBP',  '59408-5': 'SpO2',
  };

  // 以時間分桶（每 4h）
  const buckets: Record<string, Partial<VitalSignVM>> = {};
  const cutoff = Date.now() - 72 * 3600 * 1000;

  resources
    .filter((r: any) => {
      const loinc = getLoincCode(r);
      const dt = new Date(r.effectiveDateTime ?? r.issued ?? 0).getTime();
      return LOINC_MAP[loinc] && dt >= cutoff;
    })
    .forEach((r: any) => {
      const loinc = getLoincCode(r);
      const key = LOINC_MAP[loinc];
      const dt = new Date(r.effectiveDateTime ?? '');
      const bucketH = Math.floor(dt.getTime() / (4 * 3600 * 1000)) * 4 * 3600 * 1000;
      const label = `${Math.round((Date.now() - bucketH) / 3600000)}h`;
      if (!buckets[label]) buckets[label] = { t: label };
      (buckets[label] as any)[key] = getObsValue(r).value;
    });

  return Object.values(buckets).sort((a, b) =>
    parseInt(b.t ?? '0') - parseInt(a.t ?? '0')
  ) as VitalSignVM[];
}

/** FHIR MedicationRequest[] → MedicationVM[] */
export function mapMedications(resources: any[]): MedicationVM[] {
  const labMap: Record<string, string> = {
    metformin: 'HbA1c / Glucose AC',
    januvia: 'HbA1c / Glucose AC',
    sitagliptin: 'HbA1c / Glucose AC',
    insulin: 'Glucose AC',
    lisinopril: 'Systolic BP / K+',
    atorvastatin: 'LDL Cholesterol',
    rosuvastatin: 'LDL Cholesterol',
    warfarin: 'PT/INR',
    aspirin: 'PT/INR',
  };

  return resources
    .filter((r: any) => r.resourceType === 'MedicationRequest' && r.status === 'active')
    .map((r: any) => {
      const name = r.medicationCodeableConcept?.text
        ?? r.medicationCodeableConcept?.coding?.[0]?.display
        ?? '(未知藥品)';
      const dosage = r.dosageInstruction?.[0];
      const qty = dosage?.doseAndRate?.[0]?.doseQuantity;
      const nameKey = name.toLowerCase().split(' ')[0];
      const lab = Object.entries(labMap).find(([k]) => nameKey.includes(k))?.[1] ?? '—';
      return {
        id: r.id ?? name,
        name,
        dose: qty ? `${qty.value} ${qty.unit}` : dosage?.text ?? '—',
        freq: dosage?.timing?.code?.text ?? dosage?.timing?.repeat?.frequency
          ? `${dosage.timing.repeat.frequency}x/day` : 'QD',
        route: dosage?.route?.coding?.[0]?.display ?? dosage?.route?.text ?? 'PO',
        lab,
        startDate: r.authoredOn?.slice(0, 10),
      };
    });
}

/** FHIR Bundle entries → JourneyEventVM[] (unified timeline) */
export function mapJourney(resources: any[]): JourneyEventVM[] {
  const events: JourneyEventVM[] = [];

  // Lab: DiagnosticReport
  resources.filter((r: any) => r.resourceType === 'DiagnosticReport').forEach((r: any) => {
    const isImage = r.category?.some((c: any) =>
      c.coding?.some((x: any) => x.code === 'RAD' || x.code === 'LP29684-5'));
    events.push({
      id: r.id ?? Math.random().toString(),
      type: isImage ? 'image' : 'lab',
      time: formatDateTime(r.effectiveDateTime ?? r.issued ?? ''),
      title: r.code?.text ?? r.code?.coding?.[0]?.display ?? '報告',
      detail: r.conclusion ? [r.conclusion] :
        r.result?.map((ref: any) => ref.display ?? ref.reference) ?? [],
      flag: r.conclusionCode?.[0]?.coding?.[0]?.code === 'A' ? 'warning' : 'normal',
    });
  });

  // Medication: MedicationRequest
  const meds = resources.filter((r: any) => r.resourceType === 'MedicationRequest');
  if (meds.length > 0) {
    const newestDate = meds.reduce((latest: string, r: any) =>
      (r.authoredOn ?? '') > latest ? (r.authoredOn ?? '') : latest, '');
    events.push({
      id: 'med-batch-' + newestDate,
      type: 'med',
      time: formatDateTime(newestDate),
      title: `新增用藥 (${meds.length} 項)`,
      detail: meds.map((r: any) => {
        const name = r.medicationCodeableConcept?.text ?? '(藥品)';
        const dosage = r.dosageInstruction?.[0];
        const qty = dosage?.doseAndRate?.[0]?.doseQuantity;
        const dose = qty ? `${qty.value} ${qty.unit}` : '—';
        return `${name} — ${dose}`;
      }),
      flag: 'info',
    });
  }

  return events.sort((a, b) => b.time.localeCompare(a.time));
}

/** 從 Observation[] 自動產生閾值警示 */
export function mapAlerts(observations: ObservationVM[], medications: MedicationVM[]): AlertVM[] {
  const alerts: AlertVM[] = [];

  // 數值閾值警示
  observations.forEach((o) => {
    if (o.status === 'warning' || o.status === 'critical') {
      alerts.push({
        id: `alert-${o.code}-${o.time}`,
        level: o.status === 'critical' ? 'danger' : 'warning',
        title: `${o.display} 異常`,
        body: `數值 ${o.value} ${o.unit}，超出安全範圍，建議評估用藥控制情況。`,
        tag: `${o.display} > 閾值`,
      });
    }
  });

  // 藥物交互作用：Warfarin + Aspirin
  const names = medications.map((m) => m.name.toLowerCase());
  const hasWarfarin = names.some((n) => n.includes('warfarin') || n.includes('可邁丁'));
  const hasAspirin = names.some((n) => n.includes('aspirin') || n.includes('阿斯匹靈'));
  if (hasWarfarin && hasAspirin) {
    alerts.unshift({
      id: 'ddi-warfarin-aspirin',
      level: 'danger',
      title: '嚴重藥物交互作用 (Warfarin + Aspirin)',
      body: '偵測到兩款藥物併用可能增加出血風險，建議立即評估並調整劑量。',
      tag: 'Drug-Drug',
    });
  }

  return alerts;
}

/** Observation[] → Health Radar ViewModel */
export function mapRadar(observations: ObservationVM[]): RadarVM[] {
  const latest = (code: string) =>
    observations.filter((o) => o.code === code).sort((a, b) => b.time.localeCompare(a.time))[0];

  const sbp = latest('8480-6')?.value ?? 120;
  const pulse = latest('8867-4')?.value ?? 80;
  const spo2 = latest('59408-5')?.value ?? 97;
  const glucose = latest('2345-7')?.value ?? 100;
  const ldl = latest('2093-3')?.value ?? 100;
  const creat = latest('38483-4')?.value ?? 1.0;

  return [
    { dim: '血壓',   v: Math.min(100, Math.round((sbp - 90) / 0.8)) },
    { dim: '心率',   v: Math.min(100, Math.round(pulse * 0.9)) },
    { dim: '肝功能', v: 90 },
    { dim: '呼吸',   v: Math.round(spo2) },
    { dim: '感染',   v: Math.min(100, Math.round(glucose / 2.5)) },
    { dim: '凝血',   v: Math.min(100, Math.round((ldl - 50) / 1.5)) },
  ];
}

/** 假設 MedicationAdministration[] → AdherenceVM[] */
export function mapAdherence(resources: any[]): AdherenceVM[] {
  return resources
    .filter((r: any) => r.resourceType === 'MedicationAdministration')
    .slice(0, 5)
    .map((r: any) => ({
      ts: formatDateTime(r.effectiveDateTime ?? ''),
      dose: r.dosage?.text ?? '—',
      giver: r.performer?.[0]?.actor?.display ?? 'RN',
      ok: r.status === 'completed',
    }));
}

/** 主聚合函式：Bundle 資源陣列 → 完整 PatientSummaryVM */
export function buildPatientSummary(
  patient: any,
  resources: any[],
): PatientSummaryVM {
  const patientVM = mapPatient(patient);
  const observations = mapObservations(resources);
  const medications = mapMedications(resources);
  const vitals = mapVitals(resources);
  const journey = mapJourney(resources);
  const adherence = mapAdherence(resources);
  const radar = mapRadar(observations);
  const alerts = mapAlerts(observations, medications);

  return { patient: patientVM, vitals, observations, medications, journey, adherence, radar, alerts };
}
