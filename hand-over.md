# Patient Journey 工作交接文件

> 交接日期：2026-06-16
> 交接人：—
> 接手人：—
> 交接範圍：全系統

---

## 1. 系統概述

**病人就醫歷程智慧平台（Patient Journey）** 是一套臨床端決策輔助與病人摘要展示平台。它以 **SMART on FHIR** 標準從 EHR/FHIR Server 取得病人臨床資料（遵循 TW Core profile），於單一儀表板呈現病人摘要、生命徵象趨勢、用藥與警示，並整合 **CDS Hooks**（開立醫令時的即時建議）與 **LLM AI 服務**（病歷摘要、聊天問答、語音醫囑解析）。

使用對象為臨床醫護人員；系統定位為 EHR 之外掛 / 啟動式（launch）智慧前端，本身不持有病歷資料庫，所有臨床資料即時自 FHIR Server 取得。技術主體為 **Next.js 14 App Router**，前端 UI 與後端 BFF（Backend-for-Frontend）整合於同一專案，生產環境部署於 **Zeabur**（https://patient-journey.zeabur.app）。

## 2. 鳥瞰架構

```
┌──────────────────────────────────────────────────────────────┐
│                  瀏覽器（臨床人員 / EHR launch）                  │
│   PatientJourneyDashboard.tsx（navbar + 三欄 grid + 病人卡片）   │
│   AiVoicePanel.tsx（語音醫囑面板）                                │
└───────────────┬──────────────────────────────────────────────┘
                │ fetch
                ▼
┌──────────────────────────────────────────────────────────────┐
│        Next.js App Router（同一服務內的 Server + BFF）            │
│                                                                │
│  Server Component        BFF / Route Handlers                  │
│  dashboard/page.tsx  →   /api/patient-summary  ← FHIR VM 組裝   │
│  (force-dynamic)         /api/auth/* （SMART PKCE / dev 登入）   │
│                          /api/ai/*   （chat / summarize / voice）│
│                          /api/cds-hooks/* （discovery/select/sign）│
│                          /api/fhir/[...path]（FHIR proxy）       │
│                          /api/health, /api/debug/session        │
│                                                                │
│  lib/fhir（client + mappers + mock）                            │
│  lib/smart（pkce + tokenExchange + discovery）                  │
│  lib/session（iron-session, 8h）                                │
│  lib/ai（llmClient → claude / deepseek）                        │
│  lib/cds（cardBuilder / drugInteractions / thresholdAlerts）    │
└───────┬──────────────────────┬─────────────────────┬──────────┘
        │ FHIR REST            │ HTTPS               │ HTTPS
        ▼                      ▼                     ▼
  FHIR Server            Anthropic Claude       DeepSeek API
  (SMART sandbox /       (LLM_PROVIDER=claude)  (LLM_PROVIDER=
   hapi.fhir.tw /                                deepseek)
   localhost:9090)
```

技術選型：Next.js 14.2.5、React 18.3.1、TypeScript 5.5.4、iron-session 8（cookie session）、recharts（趨勢圖）、lucide-react（icon）。無獨立資料庫。

## 3. 原始碼導覽

### `src/app/` — 頁面與路由

| 檔案 | 角色說明 |
|------|----------|
| `page.tsx` | 首頁：SMART launch 入口 + Dev 快速登入 |
| `layout.tsx` | 根 layout |
| `dashboard/page.tsx` | Server Component（`force-dynamic`），直接呼叫 FHIR 組裝初始摘要 |
| `dashboard/DashboardClient.tsx` | Client Component，接 `initialSummary` props 渲染 banner |

### `src/app/api/` — Route Handlers（BFF）

| 檔案 | 角色說明 |
|------|----------|
| `auth/launch/route.ts` | SMART PKCE flow 起點，存 state/verifier 至 session |
| `auth/callback/route.ts` | code→token 交換；Standalone Launch 自動探索 patient；取 Practitioner |
| `auth/logout/route.ts` | GET + POST 雙 handler，清除 session |
| `auth/dev-login/route.ts` | Dev 旁路登入（生產環境回 404） |
| `auth/dev-connect/route.ts` | 自 FHIR source 自動探索 Patient 後 redirect 至 dashboard |
| `patient-summary/route.ts` | BFF：前端 fetch 此端點取得 `PatientSummaryVM` |
| `ai/chat/route.ts` | LLM 聊天問答 |
| `ai/summarize/route.ts` | LLM 病歷摘要 |
| `ai/voice-order/route.ts` | 語音醫囑解析 |
| `cds-hooks/discovery/route.ts` | CDS Hooks service discovery |
| `cds-hooks/order-select/route.ts` | order-select hook |
| `cds-hooks/order-sign/route.ts` | order-sign hook |
| `cds-hooks/test/route.ts` | CDS Hooks 測試端點 |
| `fhir/[...path]/route.ts` | FHIR proxy（catch-all）：`GET` 讀 + `POST` 寫，token 由伺服端附加 |
| `health/route.ts` | 健康檢查（Zeabur 用，no-store） |
| `debug/session/route.ts` | ⚠️ 診斷用 session dump（待刪除，見 §9） |

### `src/lib/` — 核心邏輯

| 檔案 | 角色說明 |
|------|----------|
| `fhir/client.ts` | `fhirFetch()`：自動刷新 token；支援 `dev-no-auth` 哨兵；refresh race 用 singleton promise |
| `fhir/mappers.ts` | FHIR → ViewModel；`mapAlerts` 去重、`mapPatient` extension 正規化 |
| `fhir/mock.ts` | `MOCK_SUMMARY`，mock 模式 fallback |
| `smart/pkce.ts` | PKCE code verifier / challenge 產生 |
| `smart/tokenExchange.ts` | OAuth2 token 交換 |
| `smart/discovery.ts` | SMART well-known 端點探索 |
| `session/store.ts` | iron-session 封裝；`SESSION_SECRET` 守衛在 request-time |
| `ai/llmClient.ts` | provider 切換（claude / deepseek） |
| `ai/llmTypes.ts` | LLM 共用型別 |
| `ai/claudeClient.ts` | Anthropic Claude 呼叫 |
| `ai/deepseekClient.ts` | DeepSeek 呼叫 |
| `ai/chatAssistant.ts` | 聊天 prompt 組裝 |
| `ai/summarizer.ts` | 摘要 prompt 組裝 |
| `ai/voiceOrderParser.ts` | 語音醫囑解析邏輯 |
| `cds/cardBuilder.ts` | CDS Hooks card 組裝 |
| `cds/drugInteractions.ts` | 藥物交互作用規則 |
| `cds/thresholdAlerts.ts` | 數值閾值警示 |
| `cds/aiSuggestions.ts` | AI 建議卡片 |

### `src/components/` — UI 元件

| 檔案 | 角色說明 |
|------|----------|
| `PatientJourneyDashboard.tsx` | 主 UI：navbar + 三欄 grid + 病人卡片；右欄已掛入 `AiVoicePanel`（取代原前端模擬卡） |
| `PatientJourney.jsx` | 就醫歷程元件（舊版靜態 POC，未掛入主畫面） |
| `AiVoicePanel.tsx` | AI 服務面板（語音醫囑 / 對話 / 摘要三 tab，皆呼叫真實 API）；「確認簽署並開立」→ `POST /api/fhir/MedicationRequest` 寫入 FHIR |

### `src/types/` — 型別定義

| 檔案 | 角色說明 |
|------|----------|
| `smart.ts` | `SmartSession`（iron-session cookie schema） |
| `viewmodels.ts` | `PatientSummaryVM`, `PatientVM`, `AlertVM`… |
| `ai.ts` | AI 相關型別 |
| `cds.ts` | CDS Hooks 型別 |
| `speech.d.ts` | Web Speech API 型別宣告 |

### `scripts/`

| 檔案 | 角色說明 |
|------|----------|
| `seed-fhir.mjs` | 將測試病人 seed 至本機 HAPI FHIR Docker |
| `e2e-voice-order.mjs` | Playwright E2E：語音開立 → 生成草稿 → 簽署寫入 FHIR → 截圖 |

## 4. Build 與部署

```bash
npm install            # Node >=18.17, npm >=9
npm run dev            # 開發伺服器 localhost:3000
npm run build          # Next.js standalone build（Zeabur 用）
npm run start          # 生產啟動，預設 PORT=3000
npm run typecheck      # tsc --noEmit（CI 必過）
npm run lint           # next lint
npm run seed:fhir      # seed 測試病人到本機 HAPI FHIR Docker
npm run seed:fhir -- --name=王大華   # 自訂姓名
npm run e2e            # Playwright E2E（語音開立 → 簽署 → 截圖）
```

**Playwright E2E 前置與執行：**
```bash
npx playwright install chromium        # 首次 / CI 需先下載瀏覽器
NEXT_PUBLIC_BASE_URL="http://localhost:3007" npx next dev -p 3007   # 起 server
E2E_BASE="http://localhost:3007" npm run e2e                        # 另開終端執行
```
- 截圖輸出至 `e2e-screenshots/`（已列入 `.gitignore`）。
- ⚠️ `dev-connect` 依 `NEXT_PUBLIC_BASE_URL` 產生 redirect；dev server 落在哪個 port，`NEXT_PUBLIC_BASE_URL` 就要指向同一 port，否則 redirect 會跑到錯誤服務。

**部署（Zeabur）：** GitHub push `main` → CI typecheck + build → Zeabur 自動部署。
- `next.config.mjs`：`output: 'standalone'`（縮小部署包）；`/api/health` 設 `Cache-Control: no-store`。
- `zbpack.json`：`build_command=npm run build`、`start_command=npm run start`、`ignore_build_failed=false`。
- 詳細部署 SOP、env var 管理、HAPI FHIR Docker 啟動 → 執行 `/deploy-skill`。

**Build 關鍵限制（務必遵守，否則 standalone build 失敗）：**
1. 任何使用 `cookies()` 的 Server Component / Route Handler 必須加 `export const dynamic = 'force-dynamic';`
2. `SESSION_SECRET` 缺失檢查只能在 `getSession()` 函式內部，**不可**在 module 頂層 throw（build 時會執行）。

## 5. 設定與環境

| Key | 必填 | 說明 / 預設 |
|-----|------|------------|
| `SESSION_SECRET` | ✅ | iron-session 密鑰，≥32 字元；生產若缺失則 500 |
| `FHIR_ISS` | ✅ | SMART sandbox URL，預設 `https://launch.smarthealthit.org/v/r4/fhir` |
| `SMART_CLIENT_ID` | ✅ | OAuth client_id，預設 `patient-journey-poc` |
| `SMART_REDIRECT_URI` | ✅ | `https://<domain>/api/auth/callback` |
| `SMART_SCOPES` | ✅ | `launch openid fhirUser patient/*.read offline_access` |
| `NEXT_PUBLIC_BASE_URL` | ✅ | 生產 domain（無尾斜線）；本機 `http://localhost:3000` |
| `ALLOWED_EHR_ORIGINS` | ✅ | CDS Hooks CORS origin（逗號分隔）；開發 `*`，生產應收緊為 HIS domain |
| `LLM_PROVIDER` | ✅ | `claude`（預設）\| `deepseek` |
| `ANTHROPIC_API_KEY` | 依 provider | `sk-ant-...`（`LLM_PROVIDER=claude` 時必填） |
| `DEEPSEEK_API_KEY` | 依 provider | `sk-...`（`LLM_PROVIDER=deepseek` 時必填） |
| `DEV_FHIR_SOURCE` | dev only | `twcore`（預設）\| `local` |
| `DEV_FHIR_LOCAL` | dev only | `http://localhost:9090/fhir` |

env 檔：`.env.example`（範本）、`.env.local`（本機）、`.env.production`（生產範本）。
⚠️ Zeabur `variable env` 是 **overwrite（非 update）**，更新環境變數須帶齊全部 key，詳見 `/deploy-skill`。

## 6. API 端點

| Method | Path | 說明 |
|--------|------|------|
| GET | `/api/auth/launch` | SMART PKCE flow 起點 |
| GET | `/api/auth/callback` | OAuth code→token；自動探索 patient |
| GET / POST | `/api/auth/logout` | 清除 session |
| GET | `/api/auth/dev-login` | Dev 旁路登入（生產 404） |
| GET | `/api/auth/dev-connect` | 自 FHIR source 探索病人並導向 dashboard |
| GET | `/api/patient-summary` | 取得 `PatientSummaryVM`（前端主要資料來源） |
| POST | `/api/ai/chat` | LLM 聊天 |
| POST | `/api/ai/summarize` | LLM 病歷摘要 |
| POST | `/api/ai/voice-order` | 語音醫囑解析 |
| GET | `/api/cds-hooks/discovery` | CDS Hooks service discovery |
| POST | `/api/cds-hooks/order-select` | order-select hook |
| POST | `/api/cds-hooks/order-sign` | order-sign hook |
| GET | `/api/cds-hooks/test` | CDS Hooks 測試 |
| GET / POST | `/api/fhir/[...path]` | FHIR proxy（catch-all）：GET 讀、POST 寫（簽署開立用） |
| GET | `/api/health` | 健康檢查（Zeabur） |
| GET | `/api/debug/session` | ⚠️ 診斷用，待刪除 |

> 註：本專案為 Next.js 單一服務，前端 UI 與 BFF 後端整合於同一程式，無獨立前端子專案，故略去「6.1 前端／測試台」一節。前端開發直接以 `npm run dev`（port 3000）啟動，與後端為同一服務。

## 7. 外部系統整合

| 服務 | 用途 | 設定鍵值 | 連線方式 |
|------|------|----------|----------|
| SMART Health IT sandbox | SMART on FHIR 測試 FHIR Server | `FHIR_ISS`, `SMART_*` | PKCE OAuth2 / FHIR REST |
| HAPI FHIR（TW Core）| Dev 模式 TW Core 資料源 | `DEV_FHIR_SOURCE=twcore` → `https://hapi.fhir.tw/fhir` | 無認證 FHIR REST（`dev-no-auth` 哨兵） |
| 本機 HAPI FHIR Docker | Dev 模式本機資料源 | `DEV_FHIR_SOURCE=local`, `DEV_FHIR_LOCAL` → `http://localhost:9090/fhir` | 無認證 FHIR REST |
| Anthropic Claude API | LLM（chat/summarize/voice） | `LLM_PROVIDER=claude`, `ANTHROPIC_API_KEY` | HTTPS |
| DeepSeek API | LLM 替代 provider | `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY` | HTTPS |
| EHR / CDS Hooks 呼叫端 | 接收 CDS Hooks 請求 | `ALLOWED_EHR_ORIGINS`（CORS） | HTTP（外部呼叫進入） |

**資料模式總覽：**

| 模式 | 入口 | FHIR Server | Auth |
|------|------|-------------|------|
| Mock（預設） | 直接開 `/dashboard` | 無 | 無 |
| Dev TW Core | `/api/auth/dev-connect?source=twcore` | `https://hapi.fhir.tw/fhir` | 無 |
| Dev Local | `/api/auth/dev-connect?source=local` | `http://localhost:9090/fhir` | 無 |
| SMART OAuth | 首頁「以 SMART on FHIR 啟動」 | SMART Health IT sandbox | PKCE OAuth2 |

## 8. 特別注意事項 ⚠️

**TODO/FIXME 掃描結果：** 原始碼 `src/` 內無 TODO/FIXME/HACK/BUG 標記。唯一已記錄的待辦於 `CLAUDE.md`（見 §9）。

**安全疑慮：**
1. **`/api/debug/session`（`src/app/api/debug/session/route.ts`）** — 會 dump session 內容，含 token 等敏感資訊。目前仍保留供 Zeabur 生產診斷，**驗證完成後務必刪除**。
2. **`ALLOWED_EHR_ORIGINS=*`** — 開發預設為萬用字元，生產環境必須收緊為實際 HIS / EHR domain，否則 CDS Hooks 端點對任意來源開放 CORS。
3. **`dev-login` / `dev-connect` 旁路** — 為無認證的開發捷徑；`dev-login` 在生產回 404，務必確認生產環境未誤開 dev 模式。
4. **`SESSION_SECRET`** — ≥32 字元，生產缺失即 500；勿沿用 `.env.example` 範例值。

**關鍵設計決策（易踩雷）：**
1. **`force-dynamic`**：所有用 `cookies()` 的 route / Server Component 必加，否則 standalone build 失敗。
2. **Session guard 在 request-time**：`SESSION_SECRET` 檢查不可在 module 頂層 throw（build 時執行會炸 build）。
3. **redirect 一律用 `NEXT_PUBLIC_BASE_URL`**：Zeabur 反向代理使 `req.url` 解析為內部 `localhost:8080`；受影響端點 `callback`、`logout`、`dev-login`。
4. **SMART Standalone Launch 無 `patient` claim**：`token.patient` 永遠 undefined，已於 `callback` 以 `GET /Patient?_count=1` 取第一筆補救。
5. **`fhirFetch` dev-no-auth 哨兵**：`accessToken === 'dev-no-auth'` 時跳過 Bearer 與 refresh，直連 `session.iss`。
6. **`mapAlerts` 去重**：每個 LOINC code 只留最新一筆 Observation，避免多時間點 vital 產生重複 alert。
7. **Token refresh race**：`fhirFetch` 用 module-level `refreshPromise` singleton，並行請求共享同一次 refresh。
8. **Zeabur `variable env` 是 overwrite**：更新時須帶齊所有 key（詳見 `/deploy-skill`）。

## 9. 未完成工作與待辦事項

- [ ] **刪除 `/api/debug/session`（`src/app/api/debug/session/route.ts`）** — 來源：`CLAUDE.md` TODO。Zeabur 生產驗證完成後即可移除，目前保留供診斷。
- [ ] **生產環境收緊 `ALLOWED_EHR_ORIGINS`** — 由 `*` 改為實際 HIS / EHR domain。

> 原始碼 `src/` 內無其他 TODO/FIXME/HACK 標記。

### 9.1 近期變更紀錄（2026-06-16）

| 變更 | 檔案 | 說明 |
|------|------|------|
| 右欄改用真實 AI 面板 | `components/PatientJourneyDashboard.tsx` | 移除前端模擬 `buildFhir`/`scanOrder`，掛入 `AiVoicePanel`（呼叫真實 API）；STAT 醫囑經 `onNewAlert` 推進「主動安全警示」 |
| 語音醫囑簽署寫入 FHIR | `components/AiVoicePanel.tsx` | 「確認簽署並開立」改為 `POST /api/fhir/MedicationRequest`（draft → active），含寫入中／錯誤 UI 與回傳 id |
| FHIR Proxy 支援寫入 | `app/api/fhir/[...path]/route.ts` | 新增 `POST` handler（token 由伺服端附加） |
| Playwright E2E | `scripts/e2e-voice-order.mjs`、`package.json`、`.gitignore` | 新增 `npm run e2e`、`playwright` devDependency；截圖輸出 `e2e-screenshots/`（已忽略） |

> 驗證：`npm run typecheck` 通過；E2E 實測成功寫入 HAPI（MedicationRequest id 由伺服器分配，例：257690）。
> 注意：寫入需有效 session（dev-login / dev-connect 的 `dev-no-auth` 或 SMART OAuth）；Mock 模式回 401，UI 顯示錯誤而非假成功。

## 10. 交接確認清單

- [ ] 原始碼已交接
- [ ] 設定檔與密鑰已交接（`SESSION_SECRET`、`SMART_*`、`ANTHROPIC_API_KEY` / `DEEPSEEK_API_KEY`）
- [ ] 部署流程已說明（Zeabur，見 `/deploy-skill`）
- [ ] 外部系統帳號已交接（SMART sandbox、Anthropic / DeepSeek API key）
- [ ] 已知問題已說明（`/api/debug/session`、CORS）
- [ ] 待辦事項已確認
