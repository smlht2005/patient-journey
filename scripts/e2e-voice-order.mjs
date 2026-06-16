/**
 * E2E：語音醫囑 → FHIR 草稿 → 簽署寫入 HAPI（Playwright）
 *
 * 前置：dev server 必須以 NEXT_PUBLIC_BASE_URL 指向同一個 BASE 啟動，
 * 否則 dev-connect 會 redirect 到別的 port。
 *
 *   $env:NEXT_PUBLIC_BASE_URL="http://localhost:3007"; npx next dev -p 3007
 *   node scripts/e2e-voice-order.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3007';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'e2e-screenshots');
mkdirSync(OUT, { recursive: true });

const ORDER_TEXT = '病人有體液滯留，開立 Lasix 40mg IV STAT';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

try {
  // 1) 建立 dev-connect 會話（自動 redirect 到 /dashboard）
  await page.goto(`${BASE}/api/auth/dev-connect?source=twcore`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  await page.getByText('AI 服務').first().waitFor({ timeout: 30000 });
  console.log('[1] dashboard loaded:', page.url());

  // 2) 輸入醫囑文字 → 生成 FHIR 草稿（呼叫 /api/ai/voice-order）
  await page.locator('textarea').first().fill(ORDER_TEXT);
  await page.getByRole('button', { name: /生成 FHIR 草稿/ }).click();
  console.log('[2] generate clicked, waiting for draft…');
  await page.getByText('MedicationRequest · FHIR TW Core').waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: '確認簽署並開立' }).waitFor({ timeout: 5000 });
  await page.screenshot({ path: join(OUT, '01-fhir-draft.png'), fullPage: false });
  console.log('[2] draft generated → 01-fhir-draft.png');

  // 3) 簽署並開立（呼叫 POST /api/fhir/MedicationRequest）
  await page.getByRole('button', { name: '確認簽署並開立' }).click();
  console.log('[3] sign clicked, waiting for FHIR write…');
  const ok = page.getByText(/已開立至 FHIR/);
  await ok.waitFor({ timeout: 30000 });
  const okText = (await ok.innerText()).trim();
  await page.screenshot({ path: join(OUT, '02-signed.png'), fullPage: false });
  console.log('[3] order created →', okText, '→ 02-signed.png');

  console.log('\nE2E PASSED');
} catch (err) {
  await page.screenshot({ path: join(OUT, 'error.png'), fullPage: true }).catch(() => {});
  console.error('\nE2E FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
