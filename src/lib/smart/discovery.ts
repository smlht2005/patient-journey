import { SmartConfiguration } from '@/types/smart';

// T2.1 — 依 iss 探索 .well-known/smart-configuration
export async function discoverSmartConfig(iss: string): Promise<SmartConfiguration> {
  const base = iss.replace(/\/+$/, '');
  const url = `${base}/.well-known/smart-configuration`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`smart-configuration 探索失敗：${res.status}`);
  const cfg = (await res.json()) as SmartConfiguration;
  if (!cfg.authorization_endpoint || !cfg.token_endpoint) {
    throw new Error('smart-configuration 缺少 authorization/token endpoint');
  }
  return cfg;
}
