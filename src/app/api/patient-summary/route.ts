/**
 * BFF 聚合端點：GET /api/patient-summary?patientId={id}
 * 
 * 向 HAPI FHIR 取得 Patient + 相關資源，
 * 用 mappers 轉成前端 ViewModel 後回傳。
 * 前端永遠只打這一支 API，不直接碰 FHIR。
 */

import { NextRequest, NextResponse } from 'next/server';
import { fhirFetch } from '@/lib/fhir/client';
import { getSession } from '@/lib/session/store';

export const dynamic = 'force-dynamic';
import { buildPatientSummary } from '@/lib/fhir/mappers';
import { MOCK_SUMMARY } from '@/lib/fhir/mock';

export async function GET(req: NextRequest) {
  const session = await getSession();
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get('patientId') ?? session.patientId;

  // 未授權時回傳 mock（POC 離線 fallback）
  if (!patientId || !session.accessToken) {
    return NextResponse.json({ source: 'mock', data: MOCK_SUMMARY });
  }

  try {
    // 1. 取 Patient resource
    const patRes = await fhirFetch(`Patient/${patientId}`);
    if (!patRes.ok) throw new Error(`Patient fetch 失敗 ${patRes.status}`);
    const patient = await patRes.json();

    // 2. 以 $everything 取全部相關資源（或分開查詢）
    const [obsRes, diagRes, medRes, admRes] = await Promise.all([
      fhirFetch(`Observation?patient=${patientId}&_count=200&_sort=-date`),
      fhirFetch(`DiagnosticReport?patient=${patientId}&_count=50&_sort=-date`),
      fhirFetch(`MedicationRequest?patient=${patientId}&status=active&_count=50`),
      fhirFetch(`MedicationAdministration?patient=${patientId}&_count=30&_sort=-effective-time`),
    ]);

    // 3. 解 Bundle → 取 entry[].resource
    const toResources = async (r: Response) => {
      if (!r.ok) return [];
      const b = await r.json();
      return (b.entry ?? []).map((e: any) => e.resource).filter(Boolean);
    };

    const [observations, diagnostics, medications, administrations] = await Promise.all([
      toResources(obsRes), toResources(diagRes),
      toResources(medRes), toResources(admRes),
    ]);

    const allResources = [...observations, ...diagnostics, ...medications, ...administrations];

    // 4. 映射為 ViewModel
    const summary = buildPatientSummary(patient, allResources);
    return NextResponse.json({ source: 'fhir', data: summary });

  } catch (err) {
    // 任何 FHIR 錯誤時 fallback mock（POC 容錯）
    console.error('[patient-summary]', err);
    return NextResponse.json({ source: 'mock-fallback', error: (err as Error).message, data: MOCK_SUMMARY });
  }
}
