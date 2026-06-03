# CLAUDE.md — Patient Journey

## Project

病人就醫歷程智慧平台（Next.js 14 App Router + SMART on FHIR + TW Core）。
生產環境部署於 [Zeabur](https://patient-journey.zeabur.app)。

## Commands

```bash
npm run dev          # localhost:3000
npm run build        # Next.js standalone build（Zeabur 用）
npm run typecheck    # tsc --noEmit
npm run seed:fhir    # 將測試病人 seed 到本機 HAPI FHIR Docker
npm run seed:fhir -- --name=王大華   # 自訂姓名
```

## Architecture

```
src/app/
  page.tsx                       # 首頁（SMART launch 入口 + Dev 快速登入）
  dashboard/
    page.tsx                     # Server Component — force-dynamic，直接呼叫 FHIR
    DashboardClient.tsx          # Client — 接 initialSummary props，渲染 banner
  api/
    auth/
      launch/route.ts            # PKCE flow 起點，存 state/verifier 到 session
      callback/route.ts          # code→token，auto-discover patient，fetch Practitioner
      logout/route.ts            # GET + POST 雙 handler，清 session
      dev-login/route.ts         # Dev bypass（production = 404）
      dev-connect/route.ts       # Auto-discover Patient from FHIR source，redirect dashboard
    patient-summary/route.ts     # BFF：前端 fetch 此端點取 PatientSummaryVM
    ai/                          # LLM 聊天 / 摘要 / 語音醫囑
    cds-hooks/                   # CDS Hooks discovery + order-select + order-sign

src/lib/
  fhir/
    client.ts                    # fhirFetch()：自動刷新 token，支援 dev-no-auth
    mappers.ts                   # FHIR → VM；mapAlerts 去重、mapPatient extension 正規化
    mock.ts                      # MOCK_SUMMARY（mock 模式 fallback）
  session/store.ts               # iron-session；SESSION_SECRET 守衛在 request-time
  ai/
    llmClient.ts                 # provider 切換（claude / deepseek）
    claudeClient.ts / deepseekClient.ts

src/components/
  PatientJourneyDashboard.tsx    # 主 UI：navbar + 三欄 grid + 病人卡片

src/types/
  smart.ts                       # SmartSession interface（iron-session cookie schema）
  viewmodels.ts                  # PatientSummaryVM, PatientVM, AlertVM…
```

## Critical Rules

### 1. `force-dynamic` for cookie routes
任何 Server Component / Route Handler 使用 `cookies()` 必須加：
```typescript
export const dynamic = 'force-dynamic';
```
否則 Next.js standalone build 嘗試靜態匯出而失敗。

### 2. Session guard at request time（不能在 module 頂層）
`SESSION_SECRET` 缺失的檢查必須在 `getSession()` **函式內部**，不能在 module 頂層 throw。
Module-level throw 在 build 時執行，導致整個 build 失敗。

### 3. 所有 redirect 用 `NEXT_PUBLIC_BASE_URL`
Zeabur 反向代理讓 `req.url` 解析為內部 `localhost:8080`。
產生 redirect URL 一律用：
```typescript
const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ??
  `${req.headers.get('x-forwarded-proto')}://${req.headers.get('x-forwarded-host')}`;
```
受影響端點：`callback`、`logout`、`dev-login`。

### 4. SMART Standalone Launch 不含 `patient` claim
`token.patient` 在 Standalone Launch 永遠是 undefined。
解法已實作於 `callback/route.ts`：exchange token 後立即 `GET /Patient?_count=1` 取第一筆。

### 5. `fhirFetch` dev-no-auth 哨兵
`session.accessToken === 'dev-no-auth'` 時，跳過 Bearer token 與 token refresh，
直連 `session.iss`（本機 FHIR Docker 或 TW Core sandbox）。

### 6. Zeabur `variable env` 是 overwrite（非 update）
詳細 SOP → 執行 `/deploy-skill`

## Data Sources

| 模式 | 入口 | FHIR Server | Auth |
|------|------|-------------|------|
| Mock（預設） | 直接開 `/dashboard` | 無 | 無 |
| Dev TW Core | `/api/auth/dev-connect?source=twcore` | `https://hapi.fhir.tw/fhir` | 無 |
| Dev Local | `/api/auth/dev-connect?source=local` | `http://localhost:9090/fhir` | 無 |
| SMART OAuth | 首頁「以 SMART on FHIR 啟動」 | SMART Health IT sandbox | PKCE OAuth2 |

切換由 `DEV_FHIR_SOURCE` env var 控制（`twcore` / `local`）。

## Environment Variables

| Key | 必填 | 說明 |
|-----|------|------|
| `SESSION_SECRET` | ✅ | iron-session 密鑰，≥32 字元；生產若缺失則 500 |
| `FHIR_ISS` | ✅ | SMART Health IT sandbox URL（含 sim context） |
| `SMART_CLIENT_ID` | ✅ | OAuth client_id |
| `SMART_REDIRECT_URI` | ✅ | `https://<domain>/api/auth/callback` |
| `SMART_SCOPES` | ✅ | `launch openid fhirUser patient/*.read offline_access` |
| `NEXT_PUBLIC_BASE_URL` | ✅ | 生產 domain（無尾斜線） |
| `ALLOWED_EHR_ORIGINS` | ✅ | CDS Hooks CORS origin（生產應收緊） |
| `LLM_PROVIDER` | ✅ | `claude` \| `deepseek` |
| `ANTHROPIC_API_KEY` | 依 provider | `sk-ant-...` |
| `DEEPSEEK_API_KEY` | 依 provider | `sk-...` |
| `DEV_FHIR_SOURCE` | dev only | `twcore`（預設）\| `local` |
| `DEV_FHIR_LOCAL` | dev only | `http://localhost:9090/fhir` |

## Key Patterns

**buildPatientSummary 簽名（第三個參數是 practitionerName）：**
```typescript
buildPatientSummary(patient, resources, session.practitionerName)
```

**mapAlerts 去重：** 每個 LOINC code 只保留最新一筆 Observation，避免 19 個 vital 時間點產生重複 alert。

**Token refresh race condition：** `fhirFetch` 用 module-level `refreshPromise` singleton，多個並行請求共享同一次 refresh，不重複發起。

**Session maxAge = 8 小時**（配合臨床班次）。

## Deployment

生產網址：`https://patient-journey.zeabur.app`
CI：GitHub push `main` → typecheck + build → Zeabur 自動部署

部署 SOP、env var 管理、HAPI FHIR Docker → **`/deploy-skill`**

## TODO（記錄中，尚未完成）

- [ ] 刪除 `/api/debug/session`（Zeabur 生產驗證完成後，目前仍保留供診斷）
