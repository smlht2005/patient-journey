import { SmartConfiguration } from '@/types/smart';

const ALLOWED_SCHEMES = ['https:', 'http:'];
const MAX_REDIRECTS_SAFE = true; // fetch follows redirects by default

/**
 * T2.1 — 依 iss 探索 .well-known/smart-configuration
 * 安全加固：驗證 iss scheme，防 SSRF；生產環境強制 HTTPS。
 */
export async function discoverSmartConfig(iss: string): Promise<SmartConfiguration> {
  // ── SSRF 防護：驗證 iss 格式與 scheme ─────────────────────────────────
  let parsed: URL;
  try {
    parsed = new URL(iss);
  } catch {
    throw new Error(`無效的 FHIR ISS URL：${iss}`);
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    throw new Error(`不允許的 ISS protocol：${parsed.protocol}（僅允許 http/https）`);
  }

  // 生產環境強制 HTTPS
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('生產環境 FHIR ISS 必須使用 HTTPS');
  }

  // 阻擋 localhost / 內網 IP（防止 SSRF 打內部服務）
  const host = parsed.hostname.toLowerCase();
  const isInternal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.16.') ||
    host === '0.0.0.0';

  if (process.env.NODE_ENV === 'production' && isInternal) {
    throw new Error(`生產環境不允許連接內網 ISS：${host}`);
  }
  // ─────────────────────────────────────────────────────────────────────

  const base = iss.replace(/\/+$/, '');
  const url = `${base}/.well-known/smart-configuration`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000), // 8s timeout，防 hanging
  });

  if (!res.ok) throw new Error(`smart-configuration 探索失敗：${res.status} (${url})`);

  const cfg = (await res.json()) as SmartConfiguration;
  if (!cfg.authorization_endpoint || !cfg.token_endpoint) {
    throw new Error('smart-configuration 缺少 authorization_endpoint 或 token_endpoint');
  }
  return cfg;
}
