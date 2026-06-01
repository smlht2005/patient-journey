/**
 * AI 智慧摘要引擎 (Clinical Summary Generator)
 * 
 * 依模式輸出對應格式：
 *   handoff → 交班摘要（診斷 + 慢性病 + 追蹤重點 + 警示）
 *   rounds  → 查房摘要（生命徵象 + 用藥 + 最新檢驗）
 *   brief   → 快速摘要（3 句以內）
 */

import { callClaude, safeParseJson } from './llmClient';
import { SummarizeRequest, SummarizeResponse } from '@/types/ai';

const SYSTEM_PROMPT = `你是一位資深醫療 AI 助理，專門協助醫師快速掌握病人狀況。

輸出規則：
1. 僅輸出合法 JSON，不加任何說明。
2. summary 使用繁體中文，Markdown 格式。
3. keyFindings 條列最重要的 3–5 項異常或重點。
4. followUpItems 列出應追蹤的事項。
5. riskLevel: "low"|"moderate"|"high"（依警示數量與嚴重度）。
6. generatedAt 填入 ISO 8601 時間。

JSON 格式：
{
  "summary": "...",
  "keyFindings": ["...", "..."],
  "followUpItems": ["...", "..."],
  "riskLevel": "moderate",
  "generatedAt": "..."
}`;

function buildPrompt(req: SummarizeRequest): string {
  const mode = req.mode ?? 'handoff';
  const modeLabel = mode === 'handoff' ? '交班摘要' : mode === 'rounds' ? '查房摘要' : '快速摘要';

  const alertSection = req.alerts.length > 0
    ? `\n主動警示（${req.alerts.length} 項）：\n` + req.alerts.map(a => `  - [${a.level.toUpperCase()}] ${a.title}`).join('\n')
    : '\n主動警示：無';

  const obsSection = req.observations.length > 0
    ? '\n最新檢驗：\n' + req.observations.map(o =>
        `  - ${o.display}: ${o.value} ${o.unit} (${o.status === 'warning' ? '⚠️' : '✓'}) — ${o.time.slice(0, 10)}`
      ).join('\n')
    : '';

  const medSection = req.medications.length > 0
    ? '\n執行中醫囑：\n' + req.medications.map(m => `  - ${m.name} ${m.dose} ${m.freq} ${m.route}`).join('\n')
    : '';

  return `請為以下病人產生${modeLabel}：

病人：${req.patientName}（ID: ${req.patientId}）
入院日期：${req.admitDate ?? '未知'}
${alertSection}
${obsSection}
${medSection}

摘要模式：${mode}
${mode === 'brief' ? '請以 3 句以內的繁體中文輸出 summary，keyFindings 最多 3 項。' : ''}
${mode === 'handoff' ? '請特別強調需要接班醫師注意的事項。' : ''}
${mode === 'rounds' ? '請聚焦於今日用藥調整與檢驗趨勢。' : ''}`;
}

export async function generateSummary(
  req: SummarizeRequest,
): Promise<SummarizeResponse> {
  const rawText = await callClaude({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(req) }],
    maxTokens: 800,
    temperature: 0.3,
  });

  const parsed = safeParseJson<SummarizeResponse>(rawText);
  if (parsed) return { ...parsed, generatedAt: new Date().toISOString() };

  // fallback：將純文字包成結構
  return {
    summary: rawText,
    keyFindings: [],
    followUpItems: [],
    riskLevel: req.alerts.some(a => a.level === 'danger') ? 'high'
      : req.alerts.length > 0 ? 'moderate' : 'low',
    generatedAt: new Date().toISOString(),
  };
}
