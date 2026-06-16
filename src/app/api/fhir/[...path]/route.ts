import { NextRequest, NextResponse } from 'next/server';
import { fhirFetch } from '@/lib/fhir/client';

// T2.5 — BFF FHIR Proxy：前端只打 /api/fhir/*，token 由伺服端附加
export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  try {
    const search = new URL(req.url).search;
    const path = ctx.params.path.join('/') + search;
    const res = await fhirFetch(path);
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/fhir+json' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  try {
    const search = new URL(req.url).search;
    const path = ctx.params.path.join('/') + search;
    const body = await req.text();
    const res = await fhirFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body,
    });
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/fhir+json' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}
