# Patient Journey — 交接文件 Handover Document

> 撰寫日期：2026-06-08  
> 資料來源：Phase 1 程式碼掃描 + Phase 2 文件閱讀 + Phase 3 交叉驗證  
> 所有程式碼主張均附 `檔案:行號`

---

## 1. 專案概述 Project Summary

Patient Journey 是一個以「時間軸為核心」的病人就醫歷程智慧展示平台（POC），整合病人生命徵象、檢驗、影像與用藥資訊，透過事件驅動架構在臨床決策當下主動示警，並整合 AI 語音開立、智慧摘要與 CDS Hooks。主要使用族群為醫師與臨床資訊系統開發人員。系統採用 Next.js 14 App Router + BFF Pattern + SMART on FHIR (TW Core R4) + DeepSeek / Claude AI + iron-session 建構，目前狀態為 **POC / Demo**，seed 資料為模擬病人（陳大明），無真實病人個資，未串接正式 HIS/EHR。生產環境網址：**https://patient-journey.zeabur.app**（來源：README.md 第 7 行）。

---

## 2. 線上環境 Live Environment

| URL | 用途 | 備註 |
|-----|------|------|
| https://patient-journey.zeabur.app | 生產環境（Zeabur） | main branch 自動部署，CI 約 2 分鐘 + build 約 3-5 分鐘 |
| https://github.com/smlht2005/patient-journey | GitHub 原始碼 | zeabur.yaml repoID 來源 |
| https://hapi.fhir.tw/fhir | TW Core FHIR Sandbox（公開） | DEMO_MODE=true 時生產可直連，無 OAuth 保護 |
| https://launch.smarthealthit.org | SMART Health IT Sandbox | SMART OAuth 完整流程測試用，需帶 sim context URL |

---

## 3. 本機開發環境設定 Local Dev Setup

**前提條件**：Node.js >= 18.17、npm >= 9（來源：`package.json` 第 31-34 行）

1. 複製程式碼：`git clone https://github.com/smlht2005/patient-journey.git && cd patient-journey`
2. 安裝相依套件：`npm install`
3. 建立環境變數檔：`cp .env.example .env.local`
4. 編輯 `.env.local`，填入以下關鍵變數：

   | 變數 | 本機可用 placeholder | 說明 |
   |------|---------------------|------|
   | `SESSION_SECRET` | 任意 ≥32 字元字串，例如 `dev_secret_replace_me_32chars_min` | **必須真實填入**，不可空白 |
   | `FHIR_ISS` | `.env.example` 預設值即可 | SMART OAuth 模式才需要真實 sim URL |
   | `SMART_CLIENT_ID` | `patient-journey-poc` | 保持預設值即可 |
   | `SMART_REDIRECT_URI` | `http://localhost:3000/api/auth/callback` | 本機預設值即可 |
   | `SMART_SCOPES` | 保持預設值 | 保持預設值即可 |
   | `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | 本機預設值即可 |
   | `LLM_PROVIDER` | `deepseek` 或 `claude` | AI 功能需要對應 API Key |
   | `DEEPSEEK_API_KEY` | [請向前任確認] | 使用 DeepSeek 時必填 |
   | `ANTHROPIC_API_KEY` | [請向前任確認] | 使用 Claude 時必填；deepseek 模式可填 placeholder |
   | `ALLOWED_EHR_ORIGINS` | `*` | 本機開發可用 `*` |

5. 啟動開發伺服器：`npm run dev`
6. 開啟瀏覽器：`http://localhost:3000/dashboard`
7. 確認畫面頂部出現**黃色 Banner**「⚠️ 展示模式（Mock 資料）」即為正常（Mock 模式，無需任何 FHIR server 或授權）

> 若需連接本機 HAPI FHIR Docker（模式 B），另需：`docker run -p 9090:8080 hapiproject/hapi:latest`，再執行 `npm run seed:fhir`。

---

## 4. 已完成功能 Completed Features

### Auth（認證授權）

| 狀態 | 功能 | 對應 route 檔案 | git commit 佐證 |
|------|------|-----------------|----------------|
| ✅ Done | SMART on FHIR OAuth2 + PKCE（EHR Launch / Standalone Launch） | `src/app/api/auth/launch/route.ts`、`callback/route.ts` | `a81b09e`（README 更新含流程說明） |
| ✅ Done | Standalone Launch patient auto-discover（`Patient?_count=1`） | `src/app/api/auth/callback/route.ts` L72-91 | `3db18d3` fix(auth): auto-discover patient |
| ✅ Done | 動態 Practitioner name 從 FHIR 解析（`fhirUser` JWT claim） | `src/app/api/auth/callback/route.ts` L46-69 | `022d64b` feat(auth): dynamic practitioner name |
| ✅ Done | Dev Login bypass（`NODE_ENV=production` 回傳 404） | `src/app/api/auth/dev-login/route.ts` L7 | `938f307` feat(dev): local FHIR Docker |
| ✅ Done | Dev Connect（自動查 Patient，支援 twcore/local source） | `src/app/api/auth/dev-connect/route.ts` | `66310fe` feat(dev): DEV_FHIR_SOURCE |
| ✅ Done | Logout（GET + POST 雙 handler，清 session） | `src/app/api/auth/logout/route.ts` | `33da903`、`fd7fe45` fix(auth) |

### FHIR（資料整合）

| 狀態 | 功能 | 對應檔案 | 備註 |
|------|------|---------|------|
| ✅ Done | FHIR TW Core 資料映射（mappers.ts → ViewModel） | `src/lib/fhir/mappers.ts` | Patient/Observation/Vital/Med/Journey/Radar/Adherence/Alert |
| ✅ Done | FHIR Proxy（BFF，Bearer token 不暴露前端） | `src/app/api/fhir/[...path]/route.ts` | |
| ✅ Done | BFF 聚合端點（4 路並行 FHIR 查詢） | `src/app/api/patient-summary/route.ts` | |
| ✅ Done | 本機 FHIR Docker 整合（seed + dev-login） | `scripts/seed-fhir.mjs` | 134 entries，MRN 唯一，Lab 值隨機化 |
| ✅ Done | Mock 模式 fallback（無 session 時自動回傳假資料） | `src/lib/fhir/mock.ts` | 病人：陳大明 |

### AI（人工智慧）

| 狀態 | 功能 | 對應 route 檔案 |
|------|------|-----------------|
| ✅ Done | 臨床 AI 對話（含病人 context） | `src/app/api/ai/chat/route.ts` |
| ✅ Done | 三模式智慧摘要（handoff/rounds/brief） | `src/app/api/ai/summarize/route.ts` |
| ✅ Done | 語音醫囑 → FHIR MedicationRequest 草稿（TW Core） | `src/app/api/ai/voice-order/route.ts` |
| ✅ Done | DeepSeek / Claude 雙 provider 切換（`LLM_PROVIDER` env） | `src/lib/ai/llmClient.ts` |

### CDS Hooks

| 狀態 | 功能 | 對應 route 檔案 | 備註 |
|------|------|-----------------|------|
| ✅ Done | CDS Hooks discovery（3 個 hooks 宣告） | `src/app/api/cds-hooks/discovery/route.ts` | CORS `*` |
| ✅ Done | order-select（開立中即時 DDI 警示） | `src/app/api/cds-hooks/order-select/route.ts` | |
| ✅ Done | order-sign（簽署前全套警示，≤8 張 card） | `src/app/api/cds-hooks/order-sign/route.ts` | |
| ✅ Done | 內建測試場景（`?scenario=warfarin-aspirin`） | `src/app/api/cds-hooks/test/route.ts` | |
| ✅ Done | DDI 規則 6 條 + LOINC 閾值 8 條 + AI 建議 4 條 | `src/lib/cds/drugInteractions.ts`、`thresholdAlerts.ts`、`aiSuggestions.ts` | |
| 🚧 Partial | `patient-view` hook（discovery 已宣告，但無 POST handler） | discovery 宣告於 `discovery/route.ts`，無對應實作 | 見 code_desc.md §7.3 |

### UI（使用者介面）

| 狀態 | 功能 | 對應檔案 |
|------|------|---------|
| ✅ Done | 行動裝置響應式佈局（< 900px 單欄） | `src/components/PatientJourneyDashboard.tsx` |
| ✅ Done | 病人資訊 card（圖示欄位 + Dev 病人切換器移至 navbar） | `src/components/PatientJourneyDashboard.tsx` |
| ✅ Done | 登出按鈕（navbar 右側） | `src/components/PatientJourneyDashboard.tsx` |
| ✅ Done | Mock / 真實 FHIR banner（黃色/綠色） | `src/app/dashboard/DashboardClient.tsx` |

### DevOps

| 狀態 | 功能 | 佐證 |
|------|------|------|
| ✅ Done | Zeabur 雲端部署 + CI/CD（typecheck + build → 自動部署） | `.github/workflows/ci.yml`、`zeabur.yaml`、commit `b0fc0d9` |
| ✅ Done | Next.js standalone output | `next.config.mjs`（`output: 'standalone'`）、commit `ec0408b` |

**交叉驗證**：掃描 16 個 route 檔案，30 個 git commit，README 8 個 ✅ 項目（含路線圖 11 個 ✅）。  
README 路線圖中列出「本機 FHIR Docker 整合」、「Standalone Launch patient auto-discover」、「行動裝置響應式佈局」共 3 項 ✅，git commit 可查到對應修正（`938f307`、`3db18d3`、`becc3bb`）。  
**差異紀錄**：README 目錄結構（第 286-315 行）僅列出 `dev-login/` 但未提及 `dev-connect/`；實際 route 檔案 `src/app/api/auth/dev-connect/route.ts` 存在，功能已在 CLAUDE.md 架構圖中記錄。

---

## 5. 待辦事項 TODO & Roadmap

| 項目 | 來源 | 優先級 | 預估工作量 | 相關檔案 |
|------|------|--------|-----------|---------|
| 刪除 `/api/debug/session` 診斷端點（生產驗證完成後） | README 路線圖 `[ ]`（第 439 行）+ CLAUDE.md TODO（第 139 行） | H | 0.5h（刪除檔案 + 更新文件） | `src/app/api/debug/session/route.ts` |
| 真實 HIS/EHR 串接（EHR Launch） | README 路線圖 `[ ]`（第 437 行） | H | 3-5 天（需與 HIS 廠商協調 client_id） | `src/app/api/auth/launch/route.ts`、`src/lib/smart/discovery.ts`、見 code_desc.md §7.4 |
| TW Core Profile 完整驗證（LOINC + 台灣健保代碼對照） | README 路線圖 `[ ]`（第 438 行） | M | 2-3 天（驗證 + mapping table） | `src/lib/fhir/mappers.ts` |
| `patient-view` CDS Hook POST handler 實作 | Phase 1 route 掃描發現 `discovery/route.ts` 宣告但無對應實作 | M | 0.5 天 | `src/app/api/cds-hooks/patient-view/route.ts`（新建），見 code_desc.md §7.3 |
| `/api/ai/*` 加入 session 驗證（防 API Key 濫用） | code_desc.md §6 安全邊界（第 492-494 行）標記高風險 | H | 1 天（3 個 AI route 各加 session guard） | `src/app/api/ai/chat/route.ts`、`summarize/route.ts`、`voice-order/route.ts` |
| `ALLOWED_EHR_ORIGINS` 生產環境收緊（改為實際 EHR domain） | code_desc.md §5 關鍵限制（第 466 行）+ zeabur.yaml 預設 `*` | H | 0.5h（確認 EHR domain 後更新 Zeabur env） | `zeabur.yaml` L42-43、Zeabur 環境變數 |
| 新增 Condition FHIR resource（診斷清單） | code_desc.md §7.1 建議的第一個練習 | L | 1 天 | `src/app/api/patient-summary/route.ts`、`mappers.ts`、`viewmodels.ts`、`PatientJourneyDashboard.tsx` |
| Standalone Launch 加入 patient picker UI（取代「取第一筆」） | code_desc.md §3.6 Trade-off（第 271 行） | L（POC 夠用） | 2 天 | `src/app/api/auth/callback/route.ts` L72-91、新增 patient-picker UI 元件 |

---

## 6. 已知風險與 Bug Known Risks & Bugs

| 項目 | 風險等級 | 影響 | 建議處理 | 檔案 |
|------|---------|------|---------|------|
| `/api/debug/session` 無生產環境 guard | 🔴 高 | 任何人可呼叫，回傳 JWT claims、session.iss、FHIR Patient 查詢結果（含 session.accessToken 狀態）。實際程式碼：`export async function GET()` — 無任何 NODE_ENV 或 auth 檢查（`debug/session/route.ts` L15）。對比 `dev-login/route.ts` L7 有完整的 `if (process.env.NODE_ENV === 'production') { return 404 }` guard | **立即處理（Day 4）**：加 `if (process.env.NODE_ENV === 'production') return NextResponse.json({error:'Not Found'},{status:404})`，或直接刪除 route 檔案 | `src/app/api/debug/session/route.ts` L15 |
| `/api/ai/*` 三個端點無 session 驗證 | 🔴 高 | 任何人可不帶 session 直接呼叫，消耗 LLM API Key（DEEPSEEK_API_KEY / ANTHROPIC_API_KEY）。確認：`chat/route.ts` L12-24 無任何 `getSession()` 呼叫；`summarize/route.ts` L12-24 同樣無 session 驗證；`voice-order/route.ts` L13 雖呼叫 `getSession()` 但僅用於補入 patientId，並非拒絕未授權請求 | 在三個 AI route 加入 session guard：取得 session 後確認 `session.accessToken` 存在，否則回傳 401 | `src/app/api/ai/chat/route.ts` L12`src/app/api/ai/summarize/route.ts` L12`src/app/api/ai/voice-order/route.ts` L13 |
| `ALLOWED_EHR_ORIGINS=*` 預設值 | 🟡 中 | CDS Hooks order-sign / order-select 允許任意 origin 發送 POST 請求，session token 可能被用於後端 FHIR 查詢（`order-sign/route.ts` prefetch 補取邏輯）。確認：`zeabur.yaml` L43 `value: "*"` | 確認真實 EHR domain 後，將 Zeabur 環境變數 `ALLOWED_EHR_ORIGINS` 更新為 `https://his.hospital.com.tw`（逗號分隔支援多 domain） | `zeabur.yaml` L41-43 |
| `DEMO_MODE=true` 繞過 OAuth，`dev-no-auth` sentinel 流入生產 session | 🟡 中 | `DEMO_MODE=true` 時，生產環境 `dev-connect` route 可不需 OAuth 即建立 session（`dev-connect/route.ts` L15-16）。`session.accessToken` 被設為字面量 `'dev-no-auth'`（L58），`fhirFetch()` 見到此值會跳過 Bearer token 驗證，直連 FHIR。當前 Zeabur 預設為 `DEMO_MODE=false`（`zeabur.yaml` L48）。此模式不含真實 PHI | 確認 DEMO_MODE 當前生產狀態（見 Section 11）；若已不需展示，改為 false | `src/app/api/auth/dev-connect/route.ts` L15-16、L58`zeabur.yaml` L47-48 |
| Standalone Launch 永遠取第一筆 Patient（`Patient?_count=1`） | 🟡 中 | 若 FHIR Server 有多位病人，永遠只顯示第一筆。對 POC / Demo 場景夠用，但正式串接 HIS 需改為 patient picker UI。確認：`callback/route.ts` L73-90，`bundle.entry?.[0]?.resource?.id` 固定取 index 0 | POC 階段可接受；正式環境前需實作 patient picker | `src/app/api/auth/callback/route.ts` L73-90 |
| `zeabur variable env` overwrite 危險（非 update） | 🟡 中 | `npx zeabur variable env -f <file>` 為**完全覆蓋**語意，會刪除檔案外的所有 env key，導致 `SESSION_SECRET` 遺失造成生產 500 錯誤。已發生過一次（troubleshooting-smart-standalone-launch.md 問題三） | 每次更新環境變數，必須使用含全部 11 個 key 的完整 `.env.production` 檔（zeabur.yaml 含 DEMO_MODE，共 11 個，非 10 個）。先執行 `npx zeabur variable list` 確認 | `zeabur.yaml` L22-51（11 個 key）`.claude/skills/deploy-skill/SKILL.md` |
| GET logout 無 CSRF 保護 | 🟢 低 | 攻擊者可構造連結強制登出使用者（CSRF logout）。code_desc.md §6 第 485 行已記錄。低風險因無資料外洩，僅影響使用體驗 | 加入 CSRF token 驗證，或改為 POST-only | `src/app/api/auth/logout/route.ts` |

---

## 7. 關鍵技術決策 Key Decisions

- **Session Store：iron-session cookie vs JWT**  
  **決策**：使用 iron-session，以 `SESSION_SECRET` 加密的 httpOnly cookie 儲存 `SmartSession`（含 OAuth access token）→ **原因**：Next.js App Router serverless 環境無法使用 server-side store；httpOnly cookie 確保 token 不暴露至 client JS；AES-GCM 加密；無需外部 Redis →  **若要改**（例如加 Redis session）：`src/lib/session/store.ts`（整個模組替換）、所有 API routes 的 `getSession()` 呼叫

- **BFF Pattern（無 client→FHIR 直連）**  
  **決策**：所有 FHIR 查詢皆透過 BFF（`/api/patient-summary`、`/api/fhir/[...path]`），token 僅存伺服端 cookie → **原因**：符合 SMART App launch 安全規範；阻止 XSS 竊取 Bearer token；統一審計點 → **若要改**（例如允許前端直接查詢）：`src/lib/fhir/client.ts`、`src/app/api/fhir/[...path]/route.ts`

- **force-dynamic vs Static Export**  
  **決策**：所有使用 `cookies()` 的 route / page 加 `export const dynamic = 'force-dynamic'`；`next.config.mjs` 使用 `output: 'standalone'` → **原因**：Next.js standalone build 在 build time 執行 Server Component，此時 `SESSION_SECRET` 及 `cookies()` 不存在，不加 force-dynamic 會導致 build 失敗 → **若要改**：共 5 個檔案需宣告（`app/page.tsx`、`dashboard/page.tsx`、`api/patient-summary/route.ts`、`api/debug/session/route.ts`、`api/auth/dev-connect/route.ts`）

- **dev-no-auth Sentinel Token**  
  **決策**：`dev-login` 與 `dev-connect` 將 `session.accessToken` 設為字面量 `'dev-no-auth'`；`fhirFetch()` 見到此 sentinel 跳過 Bearer header → **原因**：不污染 OAuth flow；FHIR client 單一函式處理兩種模式；`dev-login` 生產環境永遠回傳 404 → **若要改**（修改 sentinel 字串）：`src/lib/fhir/client.ts` L48、`src/app/api/auth/dev-login/route.ts` L25、`src/app/api/auth/dev-connect/route.ts` L58

- **LLM Provider Abstraction（claude/deepseek）**  
  **決策**：`llmClient.ts` 作為 facade；讀取 `LLM_PROVIDER` env 選擇 `claudeClient` 或 `deepseekClient`；共用 `LLMCallOptions` 介面 → **原因**：成本/速度 tradeoff 可透過環境變數調整（DeepSeek 為預設）；介面隔離讓 provider 可獨立替換；未知 provider fallback deepseek → **若要改**（例如加 Azure OpenAI）：`src/lib/ai/llmClient.ts` L9-21（加 provider routing）、新建 `src/lib/ai/azureOpenAIClient.ts`，見 code_desc.md §7.2

---

## 8. 部署 SOP Deployment SOP

### 正常部署（3 步）

```bash
# Step 1：push main
git push origin main

# Step 2：CI 自動執行（約 2 分鐘）
# GitHub Actions：typecheck + build（使用假值通過）

# Step 3：Zeabur 自動拉 main 重新 build（約 3-5 分鐘）
# 無需手動操作，服務重啟後新版上線
```

確認部署狀態：`gh run list --limit 3 --repo smlht2005/patient-journey`

### 緊急 CLI 部署（webhook 未觸發時）

```bash
npx zeabur deploy \
  --service-id 6a1cb5a07a8a8f2f602163f2 \
  --environment-id 6a1cb515b764eebf4f53b5c6 \
  --project-id 6a1cb5154853e1f02a13737e
```

Polling 確認部署完成：

```bash
until [ "$(npx zeabur deployment list --json | grep '"status"' | head -1 | tr -d ' ",' | cut -d: -f2)" = "RUNNING" ]; do
  echo "等待中…"; sleep 30
done
echo "部署完成"
```

### 環境變數更新（overwrite 陷阱）

> **警告**：`npx zeabur variable env -f <file>` 為**完全覆蓋**語意，檔案外的所有 key 全部刪除。

**必須使用包含全部 11 個 key 的完整 `.env.production` 檔**：

```env
SESSION_SECRET=<32 字元以上隨機字串>          ← zeabur.yaml 故意無 value，必須手動設定
FHIR_ISS=https://launch.smarthealthit.org/v/r4/sim/<sim-context>/fhir
SMART_CLIENT_ID=patient-journey-poc
SMART_REDIRECT_URI=https://patient-journey.zeabur.app/api/auth/callback
SMART_SCOPES=launch openid fhirUser patient/*.read offline_access
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=<sk-...>
ANTHROPIC_API_KEY=<sk-ant-...>
ALLOWED_EHR_ORIGINS=*                         ← 生產應收緊為實際 EHR domain
NEXT_PUBLIC_BASE_URL=https://patient-journey.zeabur.app
DEMO_MODE=false                               ← true = 允許無 OAuth 直連 hapi.fhir.tw
```

操作：

```bash
# 先確認現有變數
npx zeabur variable list

# 完整覆蓋（確保 11 個 key 都在檔案中）
npx zeabur variable env -f .env.production

# 觸發重新部署
git commit --allow-empty -m "chore: trigger redeploy after env update"
git push origin main
```

---

## 9. 常用指令 Command Reference

| 指令 | 用途 | 備註 |
|------|------|------|
| `npm run dev` | 啟動開發伺服器 | http://localhost:3000 |
| `npm run build` | Next.js standalone build | Zeabur CI 使用 |
| `npm run typecheck` | TypeScript 型別檢查 | `tsc --noEmit` |
| `npm run seed:fhir` | Seed 測試病人到本機 HAPI FHIR | 每次產生不同病人（時間戳 MRN） |
| `npm run seed:fhir -- --name=王大華` | 自訂病人姓名 Seed | |
| `npm run seed:fhir -- --fhir=http://...` | 指定 FHIR base URL | |
| `docker run -p 9090:8080 hapiproject/hapi:latest` | 啟動本機 HAPI FHIR Docker | FHIR API 在 `/fhir` 路徑 |
| `git push origin main` | 觸發正常部署 | Zeabur 自動監聽 main |
| `git commit --allow-empty -m "chore: trigger redeploy"` | 強制觸發重新部署 | 環境變數更新後使用 |
| `npx zeabur variable list` | 確認 Zeabur 現有環境變數 | 更新前必執行 |
| `npx zeabur variable env -f .env.production` | 更新 Zeabur 環境變數（overwrite） | 使用完整 11 個 key 的檔案 |
| `gh run list --limit 3 --repo smlht2005/patient-journey` | 確認 CI/CD 狀態 | |
| `GET /api/health` | 服務存活確認 | 無需 auth，Zeabur liveness probe 用 |
| `GET /api/debug/session` | OAuth session 診斷 | 生產環境應刪除或加 guard |

---

## 10. 文件索引 Documentation Index

| 文件 | 路徑 | 一句話摘要 |
|------|------|-----------|
| README.md | `README.md` | 專案介紹、三種資料模式完整說明（Mock/Docker/SMART）、環境變數表、路線圖 |
| CLAUDE.md | `CLAUDE.md` | Claude Code 工作規則：架構圖、Critical Rules（force-dynamic 等 6 條）、環境變數完整清單 |
| SA 架構文件 | `docs/code_desc.md` | 系統架構鳥瞰、模組清單（含新手說明）、5 個設計決策、3 個資料流程、安全邊界表、擴充點 |
| Zeabur 部署疑難排解 | `docs/troubleshooting-zeabur-deploy.md` | Build 失敗（SESSION_SECRET/force-dynamic）、OAuth callback localhost:8080、環境變數設定 SOP |
| SMART Standalone Launch 疑難排解 | `docs/troubleshooting-smart-standalone-launch.md` | patient claim 缺失修法、logout redirect 問題、variable env overwrite 問題、FHIR_ISS sim URL 格式 |
| SMART OAuth 基本疑難排解 | `docs/troubleshooting-smart-auth.md` | SMART on FHIR 基本授權流程問題 |
| 部署技能 SOP | `.claude/skills/deploy-skill/SKILL.md` | Zeabur IDs、CLI 部署指令、環境變數 overwrite 陷阱、HAPI FHIR Docker 操作 |
| Claude Code 新 Session 快捷鍵 SOP | `docs/sop-claude-code-new-session-hotkey.md` | Windows Terminal 中 Claude Code 新 session 快捷鍵設定 |

---

## 11. 接手後第一週建議 First Week Checklist

### Day 1：環境設定 + 確認綠色 Banner

- [ ] 完成 Local Dev Setup（Section 3 步驟 1-7）
- [ ] `http://localhost:3000/dashboard` 看到**黃色 Banner**（Mock 模式正常）
- [ ] 執行 `docker run -p 9090:8080 hapiproject/hapi:latest` + `npm run seed:fhir`，用輸出的 Dev Login URL 確認**綠色 Banner**（模式 B 正常）
- [ ] 閱讀 README.md 快速開始與資料來源模式三節

### Day 2：讀懂架構

- [ ] 閱讀 `docs/code_desc.md`（重點：Section 1 架構圖、Section 3 設計決策、Section 6 安全邊界）
- [ ] 閱讀 `CLAUDE.md`（重點：Critical Rules 6 條）
- [ ] 閱讀本 `docs/handover.md` Section 4-6
- [ ] 在本機嘗試完整 SMART OAuth 流程（README 模式 C）

### Day 3：第一個功能任務

- [ ] 依照 `docs/code_desc.md` §7.1，新增 `Condition` FHIR resource 至 dashboard
  - 依序修改：`src/types/viewmodels.ts` → `src/lib/fhir/mappers.ts` → `src/app/dashboard/page.tsx` → `src/components/PatientJourneyDashboard.tsx`
- [ ] 執行 `npm run typecheck` 確認無型別錯誤

### Day 4：修復高風險安全問題

- [ ] `/api/debug/session` 加 NODE_ENV production guard 或直接刪除 `src/app/api/debug/session/route.ts`
- [ ] `/api/ai/chat`、`/api/ai/summarize` 加入 session.accessToken 驗證（參考 `src/app/api/patient-summary/route.ts` 的 guard 模式）
- [ ] 確認 `ALLOWED_EHR_ORIGINS` 目前生產值，評估是否需收緊

### Day 5：確認以下項目已從前任接手

- [ ] **Zeabur account access**（或取得 project member 邀請）
- [ ] **GitHub write permission**（repo: `smlht2005/patient-journey`）
- [ ] **`DEEPSEEK_API_KEY`**（生產使用中的 key）[請向前任確認]
- [ ] **`ANTHROPIC_API_KEY`**（若 LLM_PROVIDER 為 claude 時使用）[請向前任確認]
- [ ] **`SESSION_SECRET` 當前生產值**（或決定重新生成 + 更新 Zeabur + 所有用戶重新登入）[請向前任確認]
- [ ] **確認 `DEMO_MODE` 當前生產狀態**（執行 `npx zeabur variable list` 確認）[請向前任確認]
- [ ] **`FHIR_ISS` 當前生產 sim URL**（含 sim context base64 值）[請向前任確認]

---

完成：11 個章節，6 個風險，8 個 TODO
