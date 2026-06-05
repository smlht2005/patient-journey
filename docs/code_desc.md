# Patient Journey — Technical Architecture Document

> **Audience**: Solution Architects preparing for system walkthrough presentation
> **Stack**: Next.js 14 App Router · TypeScript · SMART on FHIR (TW Core) · iron-session · DeepSeek/Claude LLM · CDS Hooks 2.0
> **Last updated**: 2026-06-06

---

## 1. Bird's Eye Architecture 整體架構

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (Client)                                                           │
│  PatientJourneyDashboard.tsx  (React client component, Recharts, Lucide)    │
│  AiVoicePanel.tsx             (Web Speech API)                              │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ HTTPS / fetch
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  NEXT.JS 14 APP ROUTER  (Node.js runtime, standalone output)                │
│                                                                             │
│  Server Components (RSC)            Client Components                       │
│  ├─ app/page.tsx                    └─ app/dashboard/DashboardClient.tsx    │
│  └─ app/dashboard/page.tsx              PatientJourneyDashboard.tsx         │
│       │ direct fhirFetch()                                                  │
│       ▼                                                                     │
│  BFF API Routes (Route Handlers)                                            │
│  ├─ Auth Layer                                                              │
│  │   ├─ /api/auth/launch          SMART discovery + PKCE init               │
│  │   ├─ /api/auth/callback        state verify + token exchange             │
│  │   ├─ /api/auth/logout          session destroy                           │
│  │   ├─ /api/auth/dev-login       [DEV only, 404 in prod]                   │
│  │   └─ /api/auth/dev-connect     [DEV or DEMO_MODE=true]                   │
│  ├─ FHIR Proxy                                                              │
│  │   ├─ /api/fhir/[...path]       Bearer-token proxy                        │
│  │   └─ /api/patient-summary      aggregation BFF (4 parallel FHIR calls)  │
│  ├─ AI Layer                                                                │
│  │   ├─ /api/ai/chat              clinical chat assistant                   │
│  │   ├─ /api/ai/summarize         handoff/rounds/brief summary              │
│  │   └─ /api/ai/voice-order       NL → FHIR MedicationRequest draft        │
│  ├─ CDS Hooks                                                               │
│  │   ├─ /api/cds-hooks/discovery  GET, CORS *                               │
│  │   ├─ /api/cds-hooks/order-sign POST, CORS = ALLOWED_EHR_ORIGINS          │
│  │   ├─ /api/cds-hooks/order-select POST                                   │
│  │   └─ /api/cds-hooks/test       [DEV scenario runner]                    │
│  └─ Ops                                                                     │
│      ├─ /api/health               liveness probe (no auth)                  │
│      └─ /api/debug/session        [force-dynamic, no prod guard — risk]     │
│                                                                             │
│  Session Store (iron-session, httpOnly cookie "pj_session", 8h maxAge)     │
└────────────┬───────────────────────────┬────────────────────────────────────┘
             │                           │
   ┌─────────▼──────────┐   ┌───────────▼──────────────────────┐
   │  FHIR Server       │   │  LLM Provider                    │
   │  hapi.fhir.tw/fhir │   │  DeepSeek (default)              │
   │  or EHR FHIR R4    │   │  Claude claude-sonnet-4-20250514  │
   │  (via Bearer token)│   │  Switched by LLM_PROVIDER env    │
   └────────────────────┘   └──────────────────────────────────┘

── AUTH FLOW BRANCH ──────────────────────────────────────────────────────────

  EHR Launch:
    HIS → GET /api/auth/launch?iss=...&launch=...
          └─ discoverSmartConfig() → PKCE createPkce() → session.save()
          └─ redirect → EHR Authorization Server (S256 PKCE)
          └─ GET /api/auth/callback?code=...&state=...
          └─ state verify → exchangeCodeForToken() → patient auto-discover
          └─ session.save() → redirect /dashboard

  Standalone Launch:
    Browser → GET /api/auth/launch  (no launch param)
    Scope: SMART_SCOPES minus "launch" keyword
    token.patient absent → callback fetches Patient?_count=1

── DEV-BYPASS BRANCH ─────────────────────────────────────────────────────────

  GET /api/auth/dev-login?fhirBase=...&patientId=...
  GET /api/auth/dev-connect?source=twcore|local
    → session.accessToken = 'dev-no-auth'  (sentinel value)
    → fhirFetch() skips Bearer header, hits FHIR directly
    → BLOCKED in production unless DEMO_MODE=true (dev-login always 404 in prod)
```

---

## 2. Module Inventory 模組清單

### Auth

| Module | File Path | Responsibility | Depends On | Called By |
|--------|-----------|----------------|------------|-----------|
| Launch Handler | `src/app/api/auth/launch/route.ts` | EHR/Standalone Launch 入口；SMART discovery；PKCE 生成；session 初始化；建構 authorization URL | `smart/discovery`, `smart/pkce`, `session/store` | Browser / EHR HIS |
| Callback Handler | `src/app/api/auth/callback/route.ts` | state 驗證 (CSRF)；code↔token 交換；Practitioner name 解析；Standalone patient auto-discover；session 持久化 | `smart/tokenExchange`, `session/store` | Authorization Server redirect |
| Logout Handler | `src/app/api/auth/logout/route.ts` | session destroy；GET 導回首頁 | `session/store` | Browser / DashboardClient |
| Dev Login | `src/app/api/auth/dev-login/route.ts` | 繞過 OAuth，手動指定 fhirBase+patientId；寫入 `dev-no-auth` sentinel；生產環境 404 | `session/store` | Developer |
| Dev Connect | `src/app/api/auth/dev-connect/route.ts` | 自動查詢 FHIR 第一筆 Patient；支援 `twcore`/`local` source；`DEMO_MODE=true` 時生產可用 | `session/store` | Developer / Demo |
| SMART Discovery | `src/lib/smart/discovery.ts` | GET `.well-known/smart-configuration`；SSRF 防護（scheme 驗證、內網 IP 阻擋）；8s timeout | — | launch/route.ts |
| PKCE | `src/lib/smart/pkce.ts` | `randomBytes(48)` code_verifier；SHA-256 S256 challenge；`randomBytes(24)` state | Node.js `crypto` | launch/route.ts |
| Token Exchange | `src/lib/smart/tokenExchange.ts` | `authorization_code` 交換 token；`refresh_token` 續期；10s timeout | — | callback/route.ts, fhir/client.ts |
| Session Store | `src/lib/session/store.ts` | iron-session cookie 封裝；`SESSION_SECRET` guard（build-time 豁免 + request-time 強制）；`isTokenValid()` 含 60s buffer | `iron-session`, `types/smart` | 所有 API routes |

### FHIR

| Module | File Path | Responsibility | Depends On | Called By |
|--------|-----------|----------------|------------|-----------|
| FHIR Client | `src/lib/fhir/client.ts` | `fhirFetch()`：token 有效性檢查 → refresh singleton → Bearer header 附加；`dev-no-auth` sentinel bypass；15s timeout | `session/store`, `smart/tokenExchange` | patient-summary/route, dashboard/page, fhir/[...path]/route |
| FHIR Mappers | `src/lib/fhir/mappers.ts` | FHIR TW Core resource → ViewModel 映射；`mapPatient`, `mapObservations`, `mapVitals`（4h bucket，絕對時間 label）, `mapMedications`, `mapJourney`, `mapAlerts`（LOINC dedup）, `mapRadar`, `mapAdherence`, `buildPatientSummary` | `types/viewmodels` | dashboard/page.tsx, patient-summary/route.ts |
| Mock Data | `src/lib/fhir/mock.ts` | 離線 fallback `MOCK_SUMMARY`；無真實個資；POC 展示用 | `types/viewmodels` | patient-summary/route, dashboard/page, DashboardClient |
| FHIR Proxy | `src/app/api/fhir/[...path]/route.ts` | BFF proxy；`ctx.params.path` 重組路徑；透過 `fhirFetch` 附加 Bearer token | `fhir/client` | Frontend (optional direct calls) |
| Patient Summary | `src/app/api/patient-summary/route.ts` | 4 路 FHIR 並行查詢 (Observation/DiagnosticReport/MedicationRequest/MedicationAdministration)；`buildPatientSummary`；fallback mock | `fhir/client`, `fhir/mappers`, `fhir/mock`, `session/store` | Frontend fetch |

### AI/LLM

| Module | File Path | Responsibility | Depends On | Called By |
|--------|-----------|----------------|------------|-----------|
| LLM Client | `src/lib/ai/llmClient.ts` | Provider 路由器；讀取 `LLM_PROVIDER` env (`claude`/`deepseek`)；未知 provider fallback `deepseek` | `claudeClient`, `deepseekClient`, `llmTypes` | summarizer, chatAssistant, voiceOrderParser |
| LLM Types | `src/lib/ai/llmTypes.ts` | `LLMMessage`, `LLMCallOptions` 共用介面；`DEFAULT_MAX_TOKENS=1500`, `DEFAULT_TIMEOUT_MS=15000` | — | llmClient, claudeClient, deepseekClient |
| Claude Provider | `src/lib/ai/claudeClient.ts` | Anthropic API `v1/messages`；model `claude-sonnet-4-20250514`；`safeParseJson<T>()` 去 markdown fence | `llmTypes` | llmClient |
| DeepSeek Provider | `src/lib/ai/deepseekClient.ts` | DeepSeek `v1/chat/completions`；model `deepseek-chat`；system role 轉為 messages[0] | `llmTypes` | llmClient |
| Summarizer | `src/lib/ai/summarizer.ts` | 三模式摘要 (handoff/rounds/brief)；JSON output + fallback plain text wrapping | `llmClient`, `types/ai` | ai/summarize/route.ts |
| Chat Assistant | `src/lib/ai/chatAssistant.ts` | 帶病人 context 的臨床對話；過濾 system role messages；最近 10 輪；200 字上限建議 | `llmClient`, `types/ai` | ai/chat/route.ts |
| Voice Order Parser | `src/lib/ai/voiceOrderParser.ts` | NL → `ParsedMedIntent` (LLM) → `FhirMedicationRequest` draft；TW Core profile meta；route/freq 標準化 map | `llmClient`, `types/ai` | ai/voice-order/route.ts |

### CDS Hooks

| Module | File Path | Responsibility | Depends On | Called By |
|--------|-----------|----------------|------------|-----------|
| Card Builder | `src/lib/cds/cardBuilder.ts` | `processCdsRequest()`：DDI + threshold + AI 三層聚合；嚴重度排序；最多 8 張 card（alert fatigue 防護） | `drugInteractions`, `thresholdAlerts`, `aiSuggestions`, `types/cds` | order-sign/route, order-select/route, test/route |
| Drug Interactions | `src/lib/cds/drugInteractions.ts` | 靜態 DDI 規則表 6 條（Warfarin/Aspirin、Warfarin/NSAID、ACEI/保鉀利尿劑、Metformin/contrast、Statin/Fibrate、SSRI/Warfarin）；`detectInteractions()` | `types/cds` | cardBuilder |
| Threshold Alerts | `src/lib/cds/thresholdAlerts.ts` | 8 項 LOINC 閾值規則；`extractLatestValues()` 用獨立 timeMap 取最新值（避免 spread _time bug）；`buildThresholdCards()` | `types/cds` | cardBuilder |
| AI Suggestions | `src/lib/cds/aiSuggestions.ts` | 4 條規則式 AI 預判 card（Lisinopril K+、Metformin 腎功能、HbA1c 未達標、Warfarin INR）；同格式可替換為 LLM | `types/cds` | cardBuilder |
| Discovery | `src/app/api/cds-hooks/discovery/route.ts` | GET endpoint；服務清單 (order-select/order-sign/patient-view)；CORS `*` | `types/cds` | EHR system |
| Order Sign | `src/app/api/cds-hooks/order-sign/route.ts` | POST；DDI+threshold+AI 全套；prefetch 缺失時主動 fhirFetch；CORS 由 `ALLOWED_EHR_ORIGINS` 控制 | `cardBuilder`, `fhir/client`, `session/store` | EHR order-sign event |
| Order Select | `src/app/api/cds-hooks/order-select/route.ts` | POST；DDI+AI（threshold 僅 critical）；CORS 同上 | `cardBuilder` | EHR order-select event |

### Session

| Module | File Path | Responsibility | Depends On | Called By |
|--------|-----------|----------------|------------|-----------|
| Session Store | `src/lib/session/store.ts` | iron-session cookie 封裝 `pj_session`；httpOnly, secure(prod), sameSite=lax, 8h maxAge；SESSION_SECRET guard | `iron-session`, `types/smart` | 全部 API routes |
| SmartSession Type | `src/types/smart.ts` | Session schema：iss, tokenEndpoint, authorizationEndpoint, codeVerifier, state, accessToken, refreshToken, patientId, expiresAt, practitionerName | — | session/store |

### UI

| Module | File Path | Responsibility | Depends On | Called By |
|--------|-----------|----------------|------------|-----------|
| Root Layout | `src/app/layout.tsx` | HTML lang=zh-TW；全域 CSS | — | Next.js App Router |
| Home Page | `src/app/page.tsx` | Landing 入口；SMART launch 按鈕；DEV/DEMO mode 快速入口；`force-dynamic` | — | Browser |
| Dashboard Page | `src/app/dashboard/page.tsx` | Server Component；直接呼叫 fhirFetch（避免 self-fetch 迴圈）；Standalone patient auto-discover；傳 VM 給 Client | `session/store`, `fhir/client`, `fhir/mappers`, `fhir/mock` | Browser |
| Dashboard Client | `src/app/dashboard/DashboardClient.tsx` | 接收 Server props；mock/real 狀態 banner；傳 `canSwitchPatient` flag | `types/viewmodels`, `fhir/mock` | dashboard/page.tsx |
| PatientJourneyDashboard | `src/components/PatientJourneyDashboard.tsx` | 主 UI 元件；3 欄 grid；Recharts 生命表徵/療效/Radar；患者資訊 card；警示 card；AI 對話；語音醫囑；即時 DDI 攔截 (`scanOrder`) | `types/viewmodels`, Recharts, Lucide | DashboardClient |

---

## 3. Critical Design Decisions 關鍵設計決策

### 3.1 Session Store: iron-session cookie vs JWT

| 面向 | 內容 |
|------|------|
| **Problem** | 需要在 BFF API routes 間共享 OAuth token，且 Next.js App Router 無法使用 server-side store（serverless 部署） |
| **Decision** | 使用 iron-session：以 `SESSION_SECRET` 加密的 httpOnly cookie，儲存 `SmartSession` 物件 |
| **Why** | Server-only（不暴露 token 至 client JS）；無需外部 Redis；與 App Router `cookies()` 原生整合；AES-GCM 加密 |
| **Trade-off** | cookie 大小限制（~4KB）；若 SESSION_SECRET 輪換，所有存活 session 失效；無跨節點 revoke 能力 |

### 3.2 BFF Pattern (no direct client→FHIR)

| 面向 | 內容 |
|------|------|
| **Problem** | 若 Browser 直接持有 FHIR token，token 暴露在 client-side JS，PHI 可直接由 browser 存取 |
| **Decision** | 所有 FHIR 呼叫透過 BFF（`/api/patient-summary`、`/api/fhir/[...path]`）；token 只存在 httpOnly cookie + server memory |
| **Why** | 符合 SMART App launch 安全規範；阻止 XSS 竊取 Bearer token；統一審計點 |
| **Trade-off** | 每次 FHIR 請求多一個 BFF hop（+latency）；BFF 成為單點瓶頸 |

### 3.3 force-dynamic vs Static Export

| 面向 | 內容 |
|------|------|
| **Problem** | Next.js 預設 SSG 會在 build time 執行 server component，此時 `SESSION_SECRET` 及 `cookies()` 不存在 |
| **Decision** | 所有涉及 session 的 route 明確標記 `export const dynamic = 'force-dynamic'`（包含 `app/page.tsx`, `app/dashboard/page.tsx`, `api/patient-summary`, `api/debug/session`, `api/auth/dev-connect`） |
| **Why** | 防止 build-time throw；確保每次 request 都重新讀取 session；`next.config.mjs` 使用 `output: 'standalone'` 而非 `export` |
| **Trade-off** | 無法使用 CDN 快取這些頁面；每 request 都需 Node.js 執行 |

### 3.4 dev-no-auth Sentinel Token

| 面向 | 內容 |
|------|------|
| **Problem** | 開發/Demo 環境需要連接 FHIR 但無法完成完整 OAuth 流程（缺少 EHR launch context）|
| **Decision** | `dev-login` 與 `dev-connect` 將 `session.accessToken` 設為字面量字串 `'dev-no-auth'`；`fhirFetch()` 檢查此 sentinel，跳過 Bearer header 並直連 `session.iss` |
| **Why** | 不污染 OAuth flow；FHIR client 單一函式處理兩種模式；生產環境 `dev-login` 永遠回傳 404 |
| **Trade-off** | Sentinel 為 magic string，修改時需同步更新 `client.ts`（L48）與兩個 auth routes |

### 3.5 LLM Provider Abstraction (claude/deepseek)

| 面向 | 內容 |
|------|------|
| **Problem** | 需支援多家 LLM provider 且可熱切換，但 API 格式不同（Anthropic messages API vs OpenAI-compatible） |
| **Decision** | `llmClient.ts` 作為 facade；讀取 `LLM_PROVIDER` env 選擇實作；共用 `LLMCallOptions` 介面；未知 provider fallback deepseek |
| **Why** | 成本/速度 tradeoff 可透過環境變數調整（DeepSeek 為預設）；介面隔離讓 provider 可獨立替換 |
| **Trade-off** | Claude 的 `system` 為獨立 param；DeepSeek 轉為 messages[0] role=system，語意略有差異；streaming 目前未實作 |

### 3.6 SMART Standalone Launch Patient Auto-Discover

| 面向 | 內容 |
|------|------|
| **Problem** | Standalone Launch 時 SMART server token response 不含 `patient` claim（無 EHR context），但 dashboard 需要 patientId |
| **Decision** | 兩處自動補救：(1) `callback/route.ts` token 交換後若 `token.patient` 為空，立即查 `Patient?_count=1`；(2) `dashboard/page.tsx` 若 `session.patientId` 仍空，再查一次 |
| **Why** | TW Core Sandbox (hapi.fhir.tw) 不回傳 patient claim；Demo 流程需無縫降級 |
| **Trade-off** | 永遠取第一筆 Patient（適合 POC；正式需 patient picker UI）；多一次 FHIR round-trip |

### 3.7 DEMO_MODE env for Production TW Core Access

| 面向 | 內容 |
|------|------|
| **Problem** | TW Core Sandbox 無 OAuth；生產環境又需要展示真實 FHIR 資料 |
| **Decision** | `DEMO_MODE=true` 讓 `dev-connect` route 在 `NODE_ENV=production` 下仍可使用（`twcore` source only，`local` source 被封鎖）|
| **Why** | 滿足 POC 對外展示需求，同時阻止 `local` source（生產環境 Zeabur 無 localhost:9090） |
| **Trade-off** | `DEMO_MODE=true` + `production` 組合下，`dev-no-auth` sentinel 流入生產 session，無 SMART token 保護；**不適合含真實 PHI 的生產環境** |

---

## 4. Data Flow Walkthroughs 資料流程

### Flow A: SMART OAuth PKCE Flow（launch → callback → dashboard）

```
Step  File/Function                          Action
───────────────────────────────────────────────────────────────────────────────
1.    app/page.tsx                           User clicks "以 SMART on FHIR 啟動"
                                             → GET /api/auth/launch

2.    app/api/auth/launch/route.ts           讀取 ?iss 或 FHIR_ISS env
      lib/smart/discovery.ts
      discoverSmartConfig(iss)               GET {iss}/.well-known/smart-configuration
                                             SSRF 防護：驗證 scheme/host；8s timeout
                                             回傳 { authorization_endpoint, token_endpoint }

3.    lib/smart/pkce.ts
      createPkce()                           randomBytes(48) → base64url → codeVerifier
                                             SHA-256(codeVerifier) → base64url → codeChallenge
                                             randomBytes(24) → state

4.    lib/session/store.ts
      session.save()                         儲存 { iss, authorizationEndpoint, tokenEndpoint,
                                             codeVerifier, state } 至 iron-session cookie

5.    app/api/auth/launch/route.ts           Standalone Launch: 從 SMART_SCOPES 移除 "launch"
                                             建構 authUrl (response_type=code, PKCE S256, aud=iss)
                                             302 redirect → EHR Authorization Server

6.    [EHR Authorization Server]             使用者認證 + 授權 consent
                                             302 redirect → SMART_REDIRECT_URI?code=...&state=...

7.    app/api/auth/callback/route.ts         驗 state === session.state (CSRF 防護)
      lib/smart/tokenExchange.ts
      exchangeCodeForToken()                 POST {tokenEndpoint}
                                             body: grant_type=authorization_code + code_verifier
                                             10s timeout

8.    app/api/auth/callback/route.ts         JWT payload decode → fhirUser claim
                                             若含 Practitioner/ → GET {iss}/Practitioner/{id}
                                             → session.practitionerName

9.    app/api/auth/callback/route.ts         若 token.patient 為空 (Standalone)
                                             GET {iss}/Patient?_count=1
                                             → session.patientId = bundle.entry[0].resource.id

10.   lib/session/store.ts
      session.save()                         更新 { accessToken, refreshToken, expiresAt,
                                             patientId, practitionerName }
                                             清除 codeVerifier, state

11.   app/api/auth/callback/route.ts         NEXT_PUBLIC_BASE_URL ?? x-forwarded-host
                                             302 redirect → {baseUrl}/dashboard
```

### Flow B: FHIR Data Fetch Pipeline（dashboard page.tsx → fhirFetch → mappers → ViewModel）

```
Step  File/Function                          Action
───────────────────────────────────────────────────────────────────────────────
1.    app/dashboard/page.tsx                 Server Component，每 request 執行 (force-dynamic)
      getSession()                           讀取 iron-session cookie

2.    app/dashboard/page.tsx                 isTokenValid(session) = expiresAt - 60s > now()
                                             若 tokenValid && !patientId → Patient?_count=1 auto-discover

3.    lib/fhir/client.ts
      fhirFetch()                            若 accessToken === 'dev-no-auth':
                                               跳過 Bearer，直連 session.iss
                                             否則:
                                               ensureValidToken() → 若過期觸發 refreshPromise singleton
                                               附加 Authorization: Bearer {accessToken}
                                               15s timeout

4.    app/dashboard/page.tsx                 Promise.all([
                                               fhirFetch(Patient/{patientId}),
                                               fhirFetch(Observation?patient=...&_count=200),
                                               fhirFetch(DiagnosticReport?...&_count=50),
                                               fhirFetch(MedicationRequest?...status=active),
                                               fhirFetch(MedicationAdministration?...&_count=30)
                                             ])

5.    app/dashboard/page.tsx
      toResources(response)                  Bundle.entry[].resource 展開

6.    lib/fhir/mappers.ts
      buildPatientSummary(patient, resources) 依 resourceType dispatch：
                                               mapPatient()       → PatientVM
                                               mapObservations()  → ObservationVM[] (含 LOINC status)
                                               mapVitals()        → VitalSignVM[] (4h bucket, 72h window)
                                               mapMedications()   → MedicationVM[] (status=active only)
                                               mapJourney()       → JourneyEventVM[] (DiagnosticReport + MedRequest)
                                               mapAdherence()     → AdherenceVM[] (MedicationAdministration)
                                               mapRadar()         → RadarVM[] (6 維度)
                                               mapAlerts()        → AlertVM[] (LOINC dedup + DDI check)

7.    app/dashboard/page.tsx                 回傳 PatientSummaryVM 給 DashboardClient props
      app/dashboard/DashboardClient.tsx      props drilling → PatientJourneyDashboard
      src/components/PatientJourneyDashboard.tsx  React state 初始化，Recharts 渲染

     [若任一步驟失敗] → fallback MOCK_SUMMARY，source='mock-fallback'
```

### Flow C: CDS Hooks order-sign Intercept（EHR POST → drugInteractions → cardBuilder → response）

```
Step  File/Function                          Action
───────────────────────────────────────────────────────────────────────────────
1.    [EHR System]                           醫師即將簽署醫囑
                                             POST /api/cds-hooks/order-sign
                                             body: CdsHookRequest { hook, context, prefetch }
                                             context.draftOrders = Bundle of MedicationRequest

2.    app/api/cds-hooks/order-sign/route.ts  getCorsHeaders(): 驗證 Origin vs ALLOWED_EHR_ORIGINS
                                             hook !== 'order-sign' → return { cards: [] }

3.    app/api/cds-hooks/order-sign/route.ts  prefetch.observations 存在？直接使用
                                             否則 fhirFetch(Observation?patient=...) 補取

4.    lib/cds/cardBuilder.ts
      processCdsRequest(req, prefetchObs)    draftOrders = context.draftOrders.entry[].resource

5.    lib/cds/drugInteractions.ts
      detectInteractions(draftOrders)        提取 MedicationRequest.medicationCodeableConcept.text (toLowerCase)
                                             比對 DDI_RULES[].drugs (every() → includes())
                                             回傳命中的 DrugInteraction[]

6.    lib/cds/cardBuilder.ts
      buildDdiCards(draftOrders)             DrugInteraction → CdsCard
                                             indicator: critical/warning
                                             suggestions, overrideReasons, links

7.    lib/cds/thresholdAlerts.ts
      extractLatestValues(prefetchObs)       各 LOINC 取最新值（timeMap 去重）
      buildThresholdCards(prefetchObs)       比對 THRESHOLD_RULES 8 條
                                             order-sign: 全部 warning+critical
                                             order-select: 僅 critical

8.    lib/cds/aiSuggestions.ts
      buildAiSuggestionCards(draftOrders,    建立 ClinicalContext {medicationNames, latestLabs}
        prefetchObs)                         執行 AI_RULES[].trigger(ctx) → 命中者呼叫 .card(ctx)
                                             (規則式，非即時 LLM 呼叫)

9.    lib/cds/cardBuilder.ts                 三類 cards 合併
                                             排序：critical(0) > warning(1) > info(2)，同級 summary 字母序
                                             slice(0, 8) — alert fatigue 防護

10.   app/api/cds-hooks/order-sign/route.ts  NextResponse.json({ cards }, { headers: corsHeaders })
      [EHR System]                           渲染 CDS Cards，醫師決策（接受/覆寫/忽略）
```

---

## 5. Key Invariants & Constraints 關鍵限制

- **`force-dynamic` 必要性**：所有讀取 `cookies()` 的 Server Component 或 Route Handler 必須標記 `export const dynamic = 'force-dynamic'`。`session/store.ts` 的 `getSession()` 在 build time 呼叫 `cookies()` 會 throw；`SESSION_SECRET` guard 在 request time 才執行，不在 build time 執行（`store.ts` L18–25）。

- **SESSION_SECRET guard 位置**：guard 在 `getSession()` 被呼叫時執行，而非 module load time。這允許 `next build` 在沒有 `SESSION_SECRET` 的 CI 環境成功，但任何 runtime session 讀取都會 throw（`store.ts` L19–24）。

- **NEXT_PUBLIC_BASE_URL redirect 規則**：`callback/route.ts` 與 `logout/route.ts` 都使用 `NEXT_PUBLIC_BASE_URL ?? x-forwarded-host` 建構 redirect URL。Zeabur 反向代理會讓 `req.url` 解析為內部 `localhost`，不設此變數會導致 redirect 失敗（`callback/route.ts` L95–98）。

- **Zeabur variable env overwrite 危險**：`zeabur.yaml` 中有 `value: "false"` 的 `DEMO_MODE` 預設值。若在 Zeabur Dashboard 手動設定 env，`zeabur.yaml` 的 `value` 會被覆蓋；反之若 `zeabur.yaml` 有 `value` 欄位，重新部署會重置 Dashboard 中的設定。`SESSION_SECRET` 在 `zeabur.yaml` 中故意無 `value`，要求手動在 Dashboard 設定。

- **Token Refresh Singleton**：`fhir/client.ts` 使用 module-level `let refreshPromise: Promise<void> | null = null` 防止並行請求同時觸發 refresh（L13–45）。若 refresh 完成後 `refreshPromise` 設回 `null`。注意：Next.js serverless 環境中 module-level variable 不跨 request 持久化，此 singleton 僅在同一 Node.js instance 的並發請求中有效。

- **mapAlerts 去重邏輯**：`mappers.ts` 的 `mapAlerts()` 使用 `latestByCode: Map<string, ObservationVM>` 確保每個 LOINC code 只保留最新一筆（L208–214）。若不去重，72 小時內多個時間點的相同指標異常值會產生多個重複警示。

- **mapVitals 時間標籤穩定性**：VitalSign 圖表 x 軸 label 使用 `MM/DD HH:00` 絕對時間（4h bucket），而非相對時間。SSR 和 CSR 使用相同 label，避免 React hydration mismatch 導致圖表閃爍（`mappers.ts` L135–138）。

- **CDS Hooks CORS**：`discovery` 端點使用 `Access-Control-Allow-Origin: *`（CDS Hooks 規範要求）；`order-sign` 和 `order-select` 使用 `ALLOWED_EHR_ORIGINS` env 限制（`zeabur.yaml` 預設 `*`）。生產部署**必須**收緊此設定為實際 EHR domain。

- **`/api/debug/session` 無生產 guard**：此 route 有 `force-dynamic` 但無 `NODE_ENV=production` 的 404 guard（對比 `dev-login` 有完整 guard）。此 endpoint 會回傳 session 中 JWT claims 及 FHIR Patient 查詢結果，屬於敏感資訊洩漏風險。

---

## 6. Security Boundary Map 安全邊界

| Endpoint | Auth Required | Production Guard | Risk if Misconfigured |
|----------|---------------|------------------|-----------------------|
| `GET /api/auth/launch` | 無（OAuth 起點） | SSRF 防護（scheme + 內網 IP 阻擋）；生產強制 HTTPS ISS | SSRF：攻擊者控制 `?iss` 可探測內網服務 |
| `GET /api/auth/callback` | state/CSRF 驗證 | state 比對（`session.state`）；OAuth error 先於 CSRF 檢查 | CSRF：state 未驗證可接受外部偽造授權碼 |
| `GET /api/auth/logout` | 無（任何人可呼叫） | 無 CSRF 保護（GET logout） | CSRF logout：攻擊者可強制登出使用者 |
| `GET /api/auth/dev-login` | 無 | `NODE_ENV === 'production'` → 404 | 若未部署 production build，暴露任意 session 寫入能力 |
| `GET /api/auth/dev-connect` | 無 | `NODE_ENV !== 'production'`；`DEMO_MODE=true` 時允許但封鎖 `local` source | `DEMO_MODE=true` + production：`dev-no-auth` sentinel 流入，無 SMART token 保護 |
| `GET /api/patient-summary` | `session.accessToken` 存在才查 FHIR；缺失時回傳 mock | `force-dynamic`；依賴 session cookie | 若 SESSION_SECRET 洩漏：攻擊者可偽造 cookie，以有效 token 查詢任意 Patient |
| `POST /api/cds-hooks/order-sign` | 無（CDS Hooks 規範不強制 session）| CORS `ALLOWED_EHR_ORIGINS`；若 prefetch 空才使用 session token 補取 | `ALLOWED_EHR_ORIGINS=*`（預設）：任何 origin 可發送 hook 請求；session token 被用於後端 FHIR 查詢 |
| `POST /api/cds-hooks/order-select` | 無 | CORS `ALLOWED_EHR_ORIGINS` | 同上 |
| `GET /api/cds-hooks/discovery` | 無 | CORS `*`（規範要求） | 服務 capability 洩漏（低風險） |
| `POST /api/ai/chat` | 無 session 驗證 | 無（任何人可呼叫） | LLM API key 被濫用；若 patientContext 含 PHI，未授權使用者可查詢 |
| `POST /api/ai/summarize` | 無 session 驗證 | 無 | 同上 |
| `POST /api/ai/voice-order` | `session.patientId` 補入（非必要） | 無 | LLM API key 濫用 |
| `GET /api/debug/session` | 無 | `force-dynamic` 但**無** `NODE_ENV` guard | **高風險**：回傳 JWT claims、FHIR Patient 資料；生產環境應移除或加 auth guard |
| `GET /api/health` | 無 | `no-store` cache header | 無（僅 liveness，無 PHI） |

---

## 7. Extension Points 擴充點

### 7.1 新增 FHIR Resource

**目標**：例如加入 `Condition`（診斷清單）至 dashboard

1. **`src/app/api/patient-summary/route.ts`**（L34–51）：在 `Promise.all` 中新增 `fhirFetch('Condition?patient=...')`，在 `toResources` 後加入 `conditions` 陣列

2. **`src/app/dashboard/page.tsx`**（L54–64）：同樣新增並行 `fhirFetch` call

3. **`src/types/viewmodels.ts`**：新增 `ConditionVM` interface，擴展 `PatientSummaryVM`

4. **`src/lib/fhir/mappers.ts`**：新增 `mapConditions(resources: any[]): ConditionVM[]` 函式，在 `buildPatientSummary` 中呼叫

5. **`src/components/PatientJourneyDashboard.tsx`**：新增 UI 元件消費 `summary.conditions`

### 7.2 替換 LLM Provider

**目標**：例如加入 Azure OpenAI 作為第三 provider

1. **`src/lib/ai/llmTypes.ts`**：介面已通用化，無需修改

2. **新增** `src/lib/ai/azureOpenAIClient.ts`：實作 `callAzureOpenAIProvider(opts: LLMCallOptions): Promise<string>`；處理 Azure API 格式差異

3. **`src/lib/ai/llmClient.ts`**（L9–21）：在 `VALID_PROVIDERS` tuple 加入 `'azure'`；在 provider routing 加入 `if (provider === 'azure') return callAzureOpenAIProvider(opts)`

4. **`zeabur.yaml` 及 `.env.local`**：加入 `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT` 等環境變數

### 7.3 新增 CDS Hook

**目標**：例如加入 `patient-view` hook 實作（目前 discovery 有宣告但無 POST handler）

1. **`src/app/api/cds-hooks/patient-view/route.ts`**（新建）：複製 `order-select/route.ts` 結構；hook 判斷改為 `patient-view`；可直接呼叫 `processCdsRequest` 或自訂邏輯

2. **`src/lib/cds/cardBuilder.ts`**（L47–78）：在 `processCdsRequest` 加入 `patient-view` 的處理分支（目前僅 order-select/order-sign 區分）

3. **`src/app/api/cds-hooks/discovery/route.ts`**（L11–49）：`patient-view` 服務定義已存在，驗證 `prefetch` 欄位與新 handler 一致

4. **`src/lib/cds/drugInteractions.ts` / `thresholdAlerts.ts`**：若需擴展知識庫，在對應陣列 `DDI_RULES` / `THRESHOLD_RULES` 中 append 新規則，無需修改呼叫介面

### 7.4 連接真實 HIS EHR 作為 Launch Context

**目標**：從醫院 HIS 觸發 EHR Launch

1. **HIS 端**：`GET https://<this-app>/api/auth/launch?iss={FHIR_BASE}&launch={opaque_context_token}`。launch token 由 EHR 的 SMART authorization server 管理。

2. **`src/app/api/auth/launch/route.ts`**（L10, L41–52）：`launch` 參數存在時保留 `launch` scope；`authUrl.searchParams.set('launch', launch)` 會自動帶入。無需修改程式碼。

3. **`src/lib/smart/discovery.ts`**（L19–68）：生產環境的 `iss` 必須是 HTTPS 且非內網 IP（L33–48）。若 HIS FHIR server 在內網，需部署 reverse proxy 或調整 SSRF 防護邏輯。

4. **環境變數**：設定 `SMART_CLIENT_ID`（向 HIS SMART server 預先申請）、`SMART_REDIRECT_URI`（`https://<app>/api/auth/callback`）、`SMART_SCOPES`（依 HIS 支援的 scope 調整）。

5. **`src/lib/fhir/mappers.ts`**（L61–93）：`mapPatient()` 的 extension URL 比對使用 keyword-based 模糊比對（`extVal`，L62–67），可容納不同 EHR 的 extension URL 格式差異。若 HIS 使用標準 TW Core extensions，無需修改。
