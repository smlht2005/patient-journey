# Patient Journey — 病人就醫歷程智慧平台

以「時間軸為核心」整合病人生命徵象、檢驗、影像與用藥，以事件驅動架構在臨床決策當下主動示警，並整合 AI 語音開立、智慧摘要與 CDS Hooks。

**Tech Stack**：Next.js 14 App Router · BFF Pattern · SMART on FHIR (TW Core) · DeepSeek / Claude AI · iron-session · CDS Hooks

**生產環境**：https://patient-journey.zeabur.app

---

## 架構鳥瞰

```
裝置 (RWD) ──▶ ① 前端 (Next.js Server + Client Components)
                    │
                    ▼
               ② BFF (Route Handlers)
                · SMART on FHIR OAuth2 + PKCE
                · Session / Token 生命週期管理
                · FHIR Proxy（Bearer token 不暴露前端）
                · AI 服務（Chat / 摘要 / 語音開立）
                · CDS Hooks（DDI / 閾值警示）
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
   ③ FHIR Server  ④ CDS Hooks   ⑤ AI 服務
    (TW Core R4)  (order-select   (DeepSeek / Claude
                   order-sign)     LLM_PROVIDER env)
```

---

## 快速開始

```bash
cp .env.example .env.local   # 填入必要環境變數
npm install
npm run dev                  # http://localhost:3000
```

首次啟動預設為 **Mock 模式**（黃色 Banner），無需任何 FHIR server 或授權即可瀏覽所有功能。

---

## 資料來源模式（三種）

### 模式 A — Mock（預設，無需任何設定）

無有效 session 時自動回傳 mock 資料（病人：陳大明）。

```
瀏覽器 → http://localhost:3000/dashboard
Dashboard 顯示黃色 Banner「⚠️ 展示模式（Mock 資料）」
```

**適用場景**：UI 開發、功能展示、無網路環境。

---

### 模式 B — 本機 FHIR Docker（無 OAuth，開發用）

連接本機 HAPI FHIR Server，繞過 SMART OAuth，直接存取真實 FHIR 資料。

#### 前提：啟動 HAPI FHIR Docker

```bash
docker run -p 9090:8080 hapiproject/hapi:latest
# FHIR base URL: http://localhost:9090/fhir
# Web UI:        http://localhost:9090
```

#### Step 1：Seed 測試資料

```bash
npm run seed:fhir
# 將 MOCK_SUMMARY 轉為 134 個 FHIR R4 resources 並 POST 至 localhost:9090/fhir
# 輸出：Patient ID 與 dev-login URL
```

seed 後 FHIR Docker 資料：

| Resource | 數量 | 說明 |
|----------|------|------|
| Patient | 1 | 陳大明，MRN: A123456789 |
| Observation | 121 | 7 筆 Lab（LOINC）+ 114 筆 Vital Signs（19 時間點 × 6 項） |
| MedicationRequest | 5 | Metformin / Januvia / Insulin / Lisinopril / Atorvastatin |
| MedicationAdministration | 3 | 給藥紀錄 |
| DiagnosticReport | 4 | 檢驗 × 3 + 影像 × 1 |

#### Step 2：Dev Login

```bash
# 將 seed 輸出的 URL 貼入瀏覽器（patientId 由 seed 分配）
http://localhost:3000/api/auth/dev-login?fhirBase=http%3A%2F%2Flocalhost%3A9090%2Ffhir&patientId=<id>
```

> **安全說明**：`/api/auth/dev-login` 在 `NODE_ENV=production` 回傳 404，生產環境完全不暴露。

Dashboard 顯示**綠色** Banner `✅ 資料來源：HAPI FHIR`。

---

### 模式 C — SMART Health IT Sandbox（完整 SMART OAuth）

透過 SMART on FHIR 標準 OAuth2 + PKCE 流程取得 access token，連接公開測試 FHIR server。

#### .env.local 設定

```env
FHIR_ISS=https://launch.smarthealthit.org/v/r4/sim/WzIsIkRhbmllbCBBZGFtcyIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir
SMART_CLIENT_ID=patient-journey-poc
SMART_REDIRECT_URI=http://localhost:3000/api/auth/callback
SMART_SCOPES=launch openid fhirUser patient/*.read offline_access
```

> `FHIR_ISS` 必須使用**含 sim context 的 URL**（如上）。裸 URL `https://launch.smarthealthit.org/v/r4/fhir` 無病人資料，會出現 SyntaxError。

#### 授權流程

```
1. 瀏覽器 → http://localhost:3000
2. 點擊「以 SMART on FHIR 啟動 (Standalone Launch)」
3. SMART Health IT 登入頁 → 選擇醫師（任意密碼）
4. Authorize App Launch → 點擊「Approve」
5. 自動 redirect → /dashboard（綠色 Banner）
```

#### OAuth 流程圖

```
首頁                /api/auth/launch        SMART Health IT
  │  點擊啟動         │                          │
  │──────────────────▶│ discoverSmartConfig()    │
  │                   │  PKCE(codeVerifier,      │
  │                   │   codeChallenge,state)   │
  │                   │  存入 session             │
  │                   │──302──────────────────▶  │
  │                   │      /authorize?          │
  │                   │      code_challenge=S256  │
  │                   │                          │ 使用者登入
  │                   │                          │ + Approve
  │   /api/auth/callback?code=xxx&state=yyy      │
  │◀──────────────────────────────────────────── │
  │  驗 state（CSRF） │                          │
  │  POST /token      │──────────────────────── ▶│
  │  code+verifier    │  access_token            │
  │                   │◀─────────────────────────│
  │  存 session       │                          │
  │  redirect /dashboard                         │
```

---

## 環境變數說明

| 變數 | 必填 | 說明 |
|------|------|------|
| `SESSION_SECRET` | ✅ | iron-session 加密金鑰，≥ 32 字元隨機字串 |
| `FHIR_ISS` | ✅ | FHIR Server base URL（含 sim context） |
| `SMART_CLIENT_ID` | ✅ | SMART OAuth client ID |
| `SMART_REDIRECT_URI` | ✅ | OAuth callback URL |
| `SMART_SCOPES` | ✅ | OAuth scope 字串 |
| `LLM_PROVIDER` | — | `deepseek`（預設）或 `claude` |
| `DEEPSEEK_API_KEY` | — | LLM_PROVIDER=deepseek 時必填 |
| `ANTHROPIC_API_KEY` | — | LLM_PROVIDER=claude 時必填 |
| `ALLOWED_EHR_ORIGINS` | — | CDS Hooks CORS origin（預設 `*`） |
| `NEXT_PUBLIC_BASE_URL` | — | 公開 domain（Zeabur 等反向代理環境必填） |

---

## Zeabur 雲端部署

**生產網址**：https://patient-journey.zeabur.app

```bash
# 上傳環境變數（首次）
npx zeabur auth login
npx zeabur variable env -f .env.production -n patient-journey

# 觸發重新部署
git push origin main   # Zeabur 自動監聽 main branch
```

**Zeabur 環境特性**：
- 內部 port：8080（`PORT=${WEB_PORT}` 自動注入）
- 反向代理：`req.url` 為內部 localhost:8080，`NEXT_PUBLIC_BASE_URL` 用於 redirect
- CI：`.github/workflows/ci.yml`（typecheck + build → Zeabur 自動部署）

---

## AI 服務（LLM Provider 切換）

```env
# 使用 DeepSeek（預設）
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-...

# 切換為 Claude
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```

重啟 dev server 後生效，無需改任何 src 程式碼。

| API | 說明 |
|-----|------|
| `POST /api/ai/chat` | 臨床 AI 對話（含病人 context） |
| `POST /api/ai/summarize` | 三模式摘要（brief / handoff / rounds） |
| `POST /api/ai/voice-order` | 語音醫囑 → FHIR MedicationRequest（TW Core） |

---

## CDS Hooks

| Endpoint | 說明 |
|----------|------|
| `GET /api/cds-hooks/discovery` | 服務發現（3 個 hooks） |
| `POST /api/cds-hooks/order-select` | 開立中即時 DDI 警示 |
| `POST /api/cds-hooks/order-sign` | 簽署前最終確認（≤ 8 張 card） |
| `GET /api/cds-hooks/test?scenario=warfarin-aspirin` | 內建測試場景 |

---

## 目錄結構

```
src/
├── app/
│   ├── api/
│   │   ├── health/                    # 健康檢查
│   │   ├── auth/
│   │   │   ├── launch/                # SMART launch + PKCE
│   │   │   ├── callback/              # Token 交換 + session
│   │   │   ├── logout/                # 登出
│   │   │   └── dev-login/             # 本機 FHIR 直連（非生產）
│   │   ├── fhir/[...path]/            # FHIR Proxy
│   │   ├── patient-summary/           # BFF 聚合端點
│   │   ├── ai/{chat,summarize,voice-order}/
│   │   └── cds-hooks/{discovery,order-select,order-sign,test}/
│   ├── dashboard/                     # Server Component + FHIR fetch
│   └── page.tsx                       # Launch 入口頁
├── lib/
│   ├── smart/{discovery,pkce,tokenExchange}.ts
│   ├── session/store.ts               # iron-session，TOKEN 僅存伺服端
│   ├── fhir/{client,mappers,mock}.ts  # Proxy / TW Core 映射 / Fallback
│   ├── ai/{llmClient,claudeClient,deepseekClient,chatAssistant,summarizer,voiceOrderParser}.ts
│   └── cds/{drugInteractions,thresholdAlerts,cardBuilder}.ts
├── types/{smart,viewmodels}.ts
scripts/
└── seed-fhir.mjs                      # Mock → FHIR R4 Transaction Bundle
docs/
├── troubleshooting-smart-auth.md      # SMART OAuth 疑難排解
└── troubleshooting-zeabur-deploy.md   # Zeabur 部署疑難排解
```

---

## 安全要點

- **PKCE (S256)**：防授權碼攔截
- **state 參數**：CSRF 防護
- **access_token**：僅存伺服端 cookie（HttpOnly / Secure / SameSite=Lax）
- **FHIR Proxy**：前端零 token 暴露
- **SSRF 防護**：`discovery.ts` 阻擋非法 ISS scheme 與內網 IP（生產環境）
- **SESSION_SECRET**：生產環境未設定時 request 時拋錯（不允許啟動）

---

## 路線圖

- [x] BFF + SMART on FHIR OAuth2（PKCE、state、token 自動續期）
- [x] FHIR TW Core 資料映射（`mappers.ts` → ViewModel）
- [x] AI 服務（Chat / 智慧摘要 / 語音開立 FHIR MedicationRequest）
- [x] CDS Hooks（DDI 6 條規則 + 8 個 LOINC 閾值警示）
- [x] Zeabur 雲端部署 + CI/CD
- [x] 本機 FHIR Docker 整合（seed + dev-login）
- [ ] 真實 HIS/EHR 串接（EHR Launch）
- [ ] TW Core Profile 完整驗證（LOINC + 台灣健保代碼對照）

---

## 範圍聲明

POC / Demo，seed 資料為模擬病人（陳大明），**無真實病人個資**，未串接正式 HIS/EHR。

## License

MIT
