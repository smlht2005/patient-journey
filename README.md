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

每次執行產生**不同病人**（姓名含時間戳或自訂），Lab 數值隨機化，MRN 唯一，與 Mock 資料明確區分。

```bash
npm run seed:fhir                      # 預設名稱：測試_MMDD_HHmm
npm run seed:fhir -- --name=王大華     # 自訂病人姓名
npm run seed:fhir -- --name=李小美 --fhir=http://localhost:9090/fhir
```

每次 seed 輸出：

```
🌐 FHIR target : http://localhost:9090/fhir
👤 病人姓名    : 王大華
🪪  MRN        : T202606021239         ← 時間戳唯一 MRN
🧪 Lab 數值    : HbA1c 7.6% | LDL 137 | Glucose 199 | SBP 138  ← 每次隨機
📦 Bundle 數量 : 134 entries

✅ Seed 完成！
👤 Patient ID : 2187
🚀 Dev Login URL：
   http://localhost:3000/api/auth/dev-login?fhirBase=...&patientId=2187
```

每次 seed 寫入的 FHIR resources（134 個）：

| Resource | 數量 | 說明 |
|----------|------|------|
| Patient | 1 | 自訂姓名，MRN = `T + yyyyMMddHHmm` |
| Observation | 121 | 7 筆 Lab（LOINC，數值隨機化）+ 114 筆 Vital Signs（19 時間點 × 6 項） |
| MedicationRequest | 5 | Metformin / Januvia / Insulin / Lisinopril / Atorvastatin |
| MedicationAdministration | 3 | 最近 3 天給藥紀錄 |
| DiagnosticReport | 4 | 檢驗 × 3 + 影像 × 1（Chest X-Ray） |

#### Step 2：Dev Login

```bash
# 將 seed 輸出的 URL 貼入瀏覽器（patientId 由 HAPI FHIR 伺服器分配）
http://localhost:3000/api/auth/dev-login?fhirBase=http%3A%2F%2Flocalhost%3A9090%2Ffhir&patientId=<id>
```

> **安全說明**：`/api/auth/dev-login` 在 `NODE_ENV=production` 回傳 404，生產環境完全不暴露。

Dashboard 顯示**綠色** Banner：
```
✅ 資料來源：HAPI FHIR (TW Core) — http://localhost:9090/fhir — 即時同步
```

#### Step 3：切換病人（Dashboard 內）

Dev 模式登入後，病人資訊 Card 底部出現「切換病人 (Dev)」區塊：

```
[ Patient ID 輸入框 ] [ 查詢 ]
```

輸入另一個 Patient ID（例如多次 seed 後的不同 ID）→ 按「查詢」或 Enter，  
即可無縫切換至同一 FHIR Docker 的其他病人，不需重新 seed。

#### 病人資訊欄位 Icon

| 欄位 | Icon | 說明 |
|------|------|------|
| 病歷號 | `#` Hash | 唯一識別碼（MRN） |
| 病房/床號 | 🛏 BedDouble | 病房與床位 |
| 主治醫師 | 🩺 Stethoscope | 負責醫師 |
| 入院日期 | 📅 CalendarDays | 住院起始日 |

---

### 模式 C — SMART Health IT Sandbox（完整 SMART OAuth）

透過 SMART on FHIR 標準 OAuth2 + PKCE 流程取得 access token，連接公開測試 FHIR server。

#### .env.local 設定

```env
# 必須使用含病人 ID 的 sim context URL（見下方說明）
FHIR_ISS=https://launch.smarthealthit.org/v/r4/sim/WzIsIkRhbmllbCBBZGFtcyIsIjk5MTcwZWM3LTNkZTQtNDE5Zi04YzM1LWQ5NWFjM2I0ZmU2YiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0=/fhir
SMART_CLIENT_ID=patient-journey-poc
SMART_REDIRECT_URI=http://localhost:3000/api/auth/callback
SMART_SCOPES=launch openid fhirUser patient/*.read offline_access
```

> **`FHIR_ISS` 注意事項：**
> - 裸 URL（`/v/r4/fhir`）無病人資料，會出現 SyntaxError
> - SMART Standalone Launch **不回傳 `patient` claim**；callback route 會自動查詢 `Patient?_count=1` 補齊

#### 授權流程

```
1. 瀏覽器 → http://localhost:3000
2. 點擊「以 SMART on FHIR 啟動 (Standalone Launch)」
3. SMART Health IT 登入頁 → 選擇醫師（任意密碼）
4. Authorize App Launch → 點擊「Approve」
5. Callback 自動查詢 FHIR 取得 Patient ID
6. 自動 redirect → /dashboard（綠色 Banner）
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
  │  若無 patient →   │ GET /fhir/Patient?_count=1│
  │  自動查詢並存入   │──────────────────────── ▶│
  │  session          │◀─────────────────────────│
  │  redirect /dashboard (NEXT_PUBLIC_BASE_URL)  │
```

#### Standalone Launch 的 patient context 說明

SMART Standalone Launch **不保證** token response 含有 `patient` claim（與 EHR Launch 不同）。
本專案在 `callback/route.ts` 實作自動補齊：

```
token.patient 有值 → 直接使用
token.patient 空   → GET /fhir/Patient?_count=1 → 取第一筆 Patient ID
```

詳細說明：`docs/troubleshooting-smart-standalone-launch.md`

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
- 反向代理：`req.url` 為內部 `localhost:8080`，所有 redirect 必須用 `NEXT_PUBLIC_BASE_URL`
- CI：`.github/workflows/ci.yml`（typecheck + build → Zeabur 自動部署）

> **`variable env` 警告**：`npx zeabur variable env -f <file>` 為**覆蓋**語意，
> 會刪除檔案外的所有 key。更新單一變數時，請確保 `.env` 檔包含**所有**必要變數。
> 詳見 `docs/troubleshooting-smart-standalone-launch.md`。

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
| `POST /api/ai/voice-order` | 語音醫囑 → FHIR MedicationRequest 草稿（TW Core） |

### 語音開立 → 簽署寫入 FHIR（完整流程）

Dashboard 右欄的 **AI 服務面板**（`components/AiVoicePanel.tsx`）已掛入主畫面，三個 tab（語音醫囑 / 對話 / 摘要）皆呼叫上述真實 API（不再是前端模擬）。語音開立完整鏈路：

```
1. 輸入文字 / 語音辨識（Web Speech API）
2. 「生成 FHIR 草稿」→ POST /api/ai/voice-order → LLM 解析回 MedicationRequest 草稿（含信心度）
3. 「確認簽署並開立」→ POST /api/fhir/MedicationRequest（status: draft → active）
4. 成功顯示「已開立至 FHIR · {id}」；priority=stat 時自動推一張警示卡至「主動安全警示」
```

> **FHIR Proxy 支援寫入**：`/api/fhir/[...path]` 除 `GET` 外已新增 `POST` handler，
> 讓前端可經 BFF 寫入 FHIR（Bearer token 仍由伺服端附加，前端零暴露）。
> 寫入僅在有效 session（dev-login / dev-connect 的 `dev-no-auth` 或 SMART OAuth）下成立；
> Mock 模式（無 session）會回 401，UI 顯示錯誤訊息而非假成功。

---

## CDS Hooks

| Endpoint | 說明 |
|----------|------|
| `GET /api/cds-hooks/discovery` | 服務發現（3 個 hooks） |
| `POST /api/cds-hooks/order-select` | 開立中即時 DDI 警示 |
| `POST /api/cds-hooks/order-sign` | 簽署前最終確認（≤ 8 張 card） |
| `GET /api/cds-hooks/test?scenario=warfarin-aspirin` | 內建測試場景 |

---

## 自動化測試（Playwright E2E）

`scripts/e2e-voice-order.mjs` 以無頭 Chromium 跑完整鏈路：
dev-connect 建立 session → 載入 dashboard → 生成 FHIR 草稿 → 簽署 → 驗證已寫入 HAPI，並截圖。

```bash
# 1) 起 dev server（BASE 須與 E2E_BASE 一致，否則 dev-connect redirect 會跑錯 port）
NEXT_PUBLIC_BASE_URL="http://localhost:3007" npx next dev -p 3007

# 2) 另開終端執行
E2E_BASE="http://localhost:3007" npm run e2e
```

- 首次或 CI 需先下載瀏覽器：`npx playwright install chromium`
- 截圖輸出至 `e2e-screenshots/`（`01-fhir-draft.png`、`02-signed.png`；失敗存 `error.png`），已列入 `.gitignore`。

> **本機 redirect 注意**：`dev-connect` 依 `NEXT_PUBLIC_BASE_URL` 產生 redirect。
> 若 dev server 因 3000 被占用而落在其他 port，務必讓 `NEXT_PUBLIC_BASE_URL` 指向同一 port，
> 否則會 redirect 到錯誤的服務。

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
│   │   ├── fhir/[...path]/            # FHIR Proxy（GET 讀 + POST 寫）
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
├── seed-fhir.mjs                      # Mock → FHIR R4 Transaction Bundle
└── e2e-voice-order.mjs                # Playwright E2E：語音開立 → 簽署寫入 FHIR
docs/
├── troubleshooting-smart-auth.md      # SMART OAuth 疑難排解
└── troubleshooting-zeabur-deploy.md   # Zeabur 部署疑難排解
```

---

## 程式碼白話導覽 — 給第一次看這個專案的你

> 看完目錄結構還是不知道從哪裡下手？這章用最簡單的說法解釋「每個資料夾在做什麼」。

### 🗂 `src/lib/` — 所有「幕後工人」都在這裡

| 資料夾 | 在做什麼 | 新手可以先看 |
|--------|---------|------------|
| `lib/fhir/client.ts` | 去 FHIR Server 拿資料的工具。帶著 token，設定 15 秒超時，自動偵測是否為測試模式（不帶 token）。 | 是 |
| `lib/fhir/mappers.ts` | FHIR 資料長得像複雜的 JSON，這裡負責把它「翻譯」成畫面看得懂的格式（例如把 Observation 變成圖表用的數字）。 | 是 |
| `lib/fhir/mock.ts` | 假資料（病人陳大明）。沒有登入 / 沒有 FHIR Server 時，系統預設顯示這份資料，讓你可以直接看畫面。 | 是 |
| `lib/smart/` | 三個幫手：`discovery.ts` 去問 FHIR Server「你的登入頁在哪裡」；`pkce.ts` 產生登入用的隨機安全碼；`tokenExchange.ts` 用授權碼換取 access token。 | 想理解 OAuth 再看 |
| `lib/session/store.ts` | 記住「誰在登入中」的地方。把 token、病人 ID 加密存在 Cookie，讓每次 request 都能知道是誰在操作。 | 是 |
| `lib/ai/llmClient.ts` | AI 功能的總開關。根據環境變數 `LLM_PROVIDER` 決定叫 Claude 還是 DeepSeek。 | 是 |
| `lib/ai/summarizer.ts` | 把病人資料整理成三種摘要：交班用（handoff）、查房用（rounds）、簡短版（brief）。 | — |
| `lib/ai/voiceOrderParser.ts` | 把醫師說的話（「病人水腫，開 Lasix 40mg IV STAT」）轉成 FHIR 藥囑格式。 | — |
| `lib/cds/drugInteractions.ts` | 內建 6 條藥物交互作用規則（例如 Warfarin + Aspirin 一起開就警告）。 | 是 |
| `lib/cds/thresholdAlerts.ts` | 8 個 LOINC 檢驗值閾值規則（例如 SBP > 160 就警示）。 | 是 |
| `lib/cds/cardBuilder.ts` | 把 DDI 警示 + 閾值警示 + AI 建議合在一起，排序後最多回傳 8 張警示卡（避免警示太多讓醫師麻痺）。 | — |

---

### 🗂 `src/app/` — 使用者看到的頁面 + 後端 API

```
app/
├── page.tsx              ← 首頁（登入入口）
├── dashboard/
│   ├── page.tsx          ← 拿 FHIR 資料的「伺服器頁面」（使用者看不到它在跑）
│   └── DashboardClient.tsx ← 把拿到的資料傳給畫面元件
└── api/
    ├── auth/             ← 所有登入相關（OAuth 換 token、登出、測試模式捷徑）
    ├── patient-summary/  ← 一口氣撈 4 種 FHIR 資料再整理（BFF 核心）
    ├── ai/               ← AI 功能（對話 / 摘要 / 語音開立）
    ├── cds-hooks/        ← 接收 HIS 開藥通知、回傳警示卡片
    ├── fhir/[...path]/   ← 前端要直接查 FHIR 的代理路口（帶 token）
    └── health/           ← 健康檢查（Zeabur 自動偵測服務是否活著用）
```

---

### 🔄 資料怎麼流到畫面上（三行版）

```
1. 使用者開啟 /dashboard
2. 伺服器（dashboard/page.tsx）讀取 Cookie → 帶 token 去 FHIR 撈 5 種資料 → mappers.ts 翻譯成畫面格式
3. 傳給 DashboardClient → PatientJourneyDashboard 渲染圖表和資訊卡
```

沒有登入 → 跳到 Mock 資料（lib/fhir/mock.ts），畫面一樣能看但是假資料（黃色 Banner 提示）。

---

### 🧭 新手建議閱讀順序

從最容易理解的開始，逐步深入：

| 階段 | 先看這個 | 你會學到 |
|------|---------|---------|
| ① 看假資料長什麼樣 | `src/lib/fhir/mock.ts` | 了解 ViewModel 結構 |
| ② 看 FHIR 怎麼翻譯 | `src/lib/fhir/mappers.ts` 中的 `mapPatient()` | 了解 FHIR JSON → 畫面 |
| ③ 看 FHIR 怎麼查詢 | `src/lib/fhir/client.ts` 中的 `fhirFetch()` | 了解 HTTP 請求 + token |
| ④ 看頁面怎麼串起來 | `src/app/dashboard/page.tsx` | 了解 Server Component + 資料流 |
| ⑤ 看 OAuth 流程 | `src/app/api/auth/launch/route.ts` → `callback/route.ts` | 了解 PKCE 登入 |
| ⑥ 看 CDS Hooks 警示 | `src/lib/cds/drugInteractions.ts` → `cardBuilder.ts` | 了解規則引擎 |

---

### ❓ 常見問題（新手版）

**Q：我改了 `mappers.ts`，畫面怎麼沒變？**
A：確認你改的是 mappers 的輸出有接到 ViewModel 型別（`src/types/viewmodels.ts`），然後重新整理瀏覽器。Server Component 沒有 hot reload，需要 `npm run dev` 重新觸發。

**Q：怎麼知道現在是 Mock 還是真實 FHIR？**
A：看 Dashboard 頂部 Banner 顏色：**黃色** = Mock 假資料，**綠色** = 真實 FHIR Server。

**Q：`dev-no-auth` 這個字串是什麼？**
A：一個暗號。`session.accessToken` 被設成這個字串時，`fhirFetch()` 就知道「現在是測試模式，不用帶 Bearer token」。只在本機開發或 DEMO_MODE 時會出現。

**Q：我想加一個新的 FHIR 欄位，改哪裡？**
A：依序改這四個：`types/viewmodels.ts`（加型別）→ `lib/fhir/mappers.ts`（加翻譯邏輯）→ `app/dashboard/page.tsx`（加 fhirFetch）→ `components/PatientJourneyDashboard.tsx`（加 UI 顯示）。詳見 `docs/code_desc.md` Section 7.1。

---

## 安全要點

- **PKCE (S256)**：防授權碼攔截
- **state 參數**：CSRF 防護
- **access_token**：僅存伺服端 cookie（HttpOnly / Secure / SameSite=Lax）
- **FHIR Proxy**：前端零 token 暴露
- **SSRF 防護**：`discovery.ts` 阻擋非法 ISS scheme 與內網 IP（生產環境）
- **SESSION_SECRET**：生產環境未設定時 request 時拋錯（不允許啟動）

---

## 疑難排解文件

| 文件 | 涵蓋內容 |
|------|---------|
| `docs/code_desc.md` | **SA 架構文件**（含新手導讀）：模組清單、設計決策、資料流、安全邊界、擴充點 |
| `docs/troubleshooting-smart-auth.md` | SMART OAuth 基本授權流程問題 |
| `docs/troubleshooting-zeabur-deploy.md` | Zeabur build 失敗（SESSION_SECRET、force-dynamic、package-lock） |
| `docs/troubleshooting-smart-standalone-launch.md` | Standalone Launch 無 patient claim、localhost:8080 redirect、variable env 覆蓋 |
| `docs/sop-claude-code-new-session-hotkey.md` | Windows Terminal 新 session 快捷鍵設定 SOP |

---

## 路線圖

- [x] BFF + SMART on FHIR OAuth2（PKCE、state、token 自動續期）
- [x] FHIR TW Core 資料映射（`mappers.ts` → ViewModel）
- [x] AI 服務（Chat / 智慧摘要 / 語音開立 FHIR MedicationRequest）
- [x] 語音醫囑簽署寫入 FHIR（FHIR Proxy POST，draft → active）
- [x] AiVoicePanel 掛入 dashboard（語音 / 對話 / 摘要皆走真實 API）
- [x] Playwright E2E（語音開立 → 簽署 → 截圖）
- [x] CDS Hooks（DDI 6 條規則 + 8 個 LOINC 閾值警示）
- [x] Zeabur 雲端部署 + CI/CD（`https://patient-journey.zeabur.app`）
- [x] 本機 FHIR Docker 整合（seed + dev-login）
- [x] Standalone Launch patient auto-discover
- [x] 行動裝置響應式佈局（< 900px 單欄）
- [ ] 真實 HIS/EHR 串接（EHR Launch）
- [ ] TW Core Profile 完整驗證（LOINC + 台灣健保代碼對照）
- [ ] 移除 `/api/debug/session` 診斷端點（驗證完成後）

---

## 範圍聲明

POC / Demo，seed 資料為模擬病人（陳大明），**無真實病人個資**，未串接正式 HIS/EHR。

## License

MIT
