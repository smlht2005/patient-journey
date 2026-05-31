/**
 * CDS Hooks Discovery Endpoint
 * GET /api/cds-hooks/discovery
 * 
 * EHR 啟動前呼叫此端點，了解本服務支援的 hooks 與 prefetch 需求。
 * 規範：https://cds-hooks.hl7.org/2.0/#discovery
 */
import { NextResponse } from 'next/server';
import { CdsDiscoveryResponse } from '@/types/cds';

const DISCOVERY: CdsDiscoveryResponse = {
  services: [
    {
      hook: 'order-select',
      id: 'patient-journey-order-select',
      title: 'Patient Journey — 醫囑選取即時警示',
      description: '醫師選取藥品時即時偵測 DDI 與 AI 預判性建議，於決策當下主動攔截風險。',
      prefetch: {
        patient: 'Patient/{{context.patientId}}',
        observations: 'Observation?patient={{context.patientId}}&_count=50&_sort=-date',
        activeMeds: 'MedicationRequest?patient={{context.patientId}}&status=active&_count=50',
      },
      usageRequirements: '需提供 context.draftOrders；建議提供 prefetch.observations 以啟用閾值警示。',
    },
    {
      hook: 'order-sign',
      id: 'patient-journey-order-sign',
      title: 'Patient Journey — 醫囑簽署完整審核',
      description: '醫師即將簽署醫囑時，執行完整 DDI + 閾值 + AI 建議三層審核，提供最終決策支援。',
      prefetch: {
        patient: 'Patient/{{context.patientId}}',
        observations: 'Observation?patient={{context.patientId}}&_count=100&_sort=-date',
        activeMeds: 'MedicationRequest?patient={{context.patientId}}&status=active&_count=50',
        diagnosticReports: 'DiagnosticReport?patient={{context.patientId}}&_count=20&_sort=-date',
      },
      usageRequirements: '需提供 context.draftOrders；完整 prefetch 可啟用全套三層審核。',
    },
    {
      hook: 'patient-view',
      id: 'patient-journey-patient-view',
      title: 'Patient Journey — 病人資料檢視摘要',
      description: '醫師開啟病人資料時，提供 AI 智慧摘要與主動安全概覽。',
      prefetch: {
        patient: 'Patient/{{context.patientId}}',
        observations: 'Observation?patient={{context.patientId}}&_count=30&_sort=-date',
        activeMeds: 'MedicationRequest?patient={{context.patientId}}&status=active&_count=30',
      },
    },
  ],
};

export async function GET() {
  return NextResponse.json(DISCOVERY, {
    headers: {
      'Access-Control-Allow-Origin': '*',          // CDS Hooks 規範要求 CORS
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
