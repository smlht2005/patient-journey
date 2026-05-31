/**
 * CDS Hooks 測試端點（開發用）
 * GET /api/cds-hooks/test?scenario=warfarin-aspirin|hyperglycemia
 */
import { NextRequest, NextResponse } from 'next/server';
import { processCdsRequest } from '@/lib/cds/cardBuilder';
import { CdsHookRequest } from '@/types/cds';

function makeObs(loinc: string, value: number, unit: string): object {
  return { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: loinc }] }, valueQuantity: { value, unit }, effectiveDateTime: new Date().toISOString() };
}
function makeMed(id: string, name: string): object {
  return { resourceType: 'MedicationRequest', id, status: 'draft', intent: 'order', medicationCodeableConcept: { text: name }, dosageInstruction: [{ text: name }] };
}

const SCENARIOS: Record<string, CdsHookRequest> = {
  'warfarin-aspirin': {
    hookInstance: 'test-001', hook: 'order-sign',
    context: {
      userId: 'Practitioner/test-dr', patientId: 'test-patient',
      selections: ['mr-warfarin','mr-aspirin'],
      draftOrders: { resourceType: 'Bundle', entry: [
        { resource: makeMed('mr-warfarin','Warfarin 5mg') as any },
        { resource: makeMed('mr-aspirin','Aspirin 100mg') as any },
        { resource: makeMed('mr-lisinopril','Lisinopril 10mg') as any },
      ]},
    },
    prefetch: { observations: { resourceType: 'Bundle', entry: [
      { resource: makeObs('2345-7', 195, 'mg/dL') as any },
      { resource: makeObs('4548-4', 8.1, '%') as any },
      { resource: makeObs('8480-6', 158, 'mmHg') as any },
    ]}},
  },
  'hyperglycemia': {
    hookInstance: 'test-002', hook: 'order-select',
    context: {
      userId: 'Practitioner/test-dr', patientId: 'test-patient',
      selections: ['mr-metformin'],
      draftOrders: { resourceType: 'Bundle', entry: [
        { resource: makeMed('mr-metformin','Metformin 500mg') as any },
      ]},
    },
    prefetch: { observations: { resourceType: 'Bundle', entry: [
      { resource: makeObs('2345-7', 310, 'mg/dL') as any },
      { resource: makeObs('38483-4', 1.6, 'mg/dL') as any },
    ]}},
  },
};

export async function GET(req: NextRequest) {
  const scenario = new URL(req.url).searchParams.get('scenario') ?? 'warfarin-aspirin';
  const hookReq = SCENARIOS[scenario] ?? SCENARIOS['warfarin-aspirin'];
  const obs = (hookReq.prefetch?.observations as any)?.entry?.map((e: any) => e.resource) ?? [];
  const result = processCdsRequest(hookReq, obs);
  return NextResponse.json({ scenario, hook: hookReq.hook, cardCount: result.cards.length, cards: result.cards });
}
