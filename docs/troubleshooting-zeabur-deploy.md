# Zeabur 部署疑難排解指南

## 目錄

1. [Build 失敗：Failed to collect page data](#1-build-失敗failed-to-collect-page-data)
2. [Build 失敗：Export encountered errors](#2-build-失敗export-encountered-errors)
3. [環境變數未生效：FHIR ISS undefined](#3-環境變數未生效fhir-iss-undefined)
4. [OAuth Callback redirect 到 localhost:8080](#4-oauth-callback-redirect-到-localhost8080)
5. [Zeabur 環境變數設定方法](#5-zeabur-環境變數設定方法)
6. [部署流程與觸發方式](#6-部署流程與觸發方式)

---

## 1. Build 失敗：Failed to collect page data

### 症狀

```
Error: Failed to collect page data for /api/auth/logout
type: 'Error'
ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1
```

### 根本原因

`src/lib/session/store.ts` 在**模組載入時**（module-level）執行守衛：

```typescript
// ❌ 錯誤寫法 — 模組載入時執行，build 時 SESSION_SECRET 不存在就 throw
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('...');
}
```

Next.js standalone build 掃描所有 API route 時會 `import` 該模組，此時 `NODE_ENV=production` 但 `SESSION_SECRET` 是 Zeabur runtime env，build 時不存在，導致 throw 使 build 崩潰。

### 修法

將守衛移進 `getSession()` 函式內（request time 才執行）：

```typescript
// ✅ 正確寫法 — 只在收到真實請求時才檢查
export async function getSession(): Promise<IronSession<SmartSession>> {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error('[Patient Journey] SESSION_SECRET 未設定。');
  }
  return getIronSession<SmartSession>(cookies(), sessionOptions);
}
```

**原則**：任何依賴 runtime env var 的守衛邏輯，不可放在模組頂層。

---

## 2. Build 失敗：Export encountered errors

### 症狀

```
> Export encountered errors on following paths:
  /api/patient-summary/route: /api/patient-summary
  /dashboard/page: /dashboard
ERROR: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1
```

### 根本原因

`/api/patient-summary` 和 `/dashboard` 都呼叫 `getSession()` → `cookies()`（Next.js 動態函式）。Next.js standalone build 嘗試靜態匯出這兩條路由時失敗。

### 修法

在這兩個檔案頂部加上 `export const dynamic = 'force-dynamic'`：

**`src/app/api/patient-summary/route.ts`**：
```typescript
export const dynamic = 'force-dynamic';
```

**`src/app/dashboard/page.tsx`**：
```typescript
export const dynamic = 'force-dynamic';
```

**原則**：凡使用 `cookies()`、`headers()`、`getSession()` 的 route 或 page，必須宣告為動態路由。

---

## 3. 環境變數未生效：FHIR ISS undefined

### 症狀

```json
{ "error": "無效的 FHIR ISS URL：undefined" }
```

### 根本原因

Zeabur 環境變數尚未上傳，或服務在設定環境變數前就已啟動（快取舊狀態）。

### 診斷步驟

```bash
# 確認目前 Zeabur 上設定的變數
npx zeabur context set project --id=<project-id> -y
npx zeabur context set service --name=patient-journey -y
npx zeabur variable list --json
```

### 修法

**方法 A — CLI 批次上傳**（推薦）：

準備 `.env.production`（已列於 `.gitignore`，不會誤 commit）：

```env
FHIR_ISS=https://launch.smarthealthit.org/v/r4/sim/<sim-context>/fhir
SMART_CLIENT_ID=patient-journey-poc
SMART_REDIRECT_URI=https://<your-domain>/api/auth/callback
SMART_SCOPES=launch openid fhirUser patient/*.read offline_access
SESSION_SECRET=<至少32字元隨機字串>
ALLOWED_EHR_ORIGINS=*
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=<your-key>
ANTHROPIC_API_KEY=sk-ant-placeholder
NEXT_PUBLIC_BASE_URL=https://<your-domain>
```

```bash
npx zeabur auth login
npx zeabur variable env -f .env.production -n patient-journey
# 上傳後刪除
del .env.production
```

**方法 B — Dashboard 手動設定**：

Zeabur Dashboard → 服務 → 環境變數 → 逐一新增。

設定完成後，觸發重新部署讓新變數生效：

```bash
git commit --allow-empty -m "chore: trigger redeploy to apply env vars"
git push origin main
```

---

## 4. OAuth Callback redirect 到 localhost:8080

### 症狀

SMART on FHIR Approve 授權後，瀏覽器跳轉至 `localhost:8080/dashboard`，顯示 `ERR_SSL_PROTOCOL_ERROR`。

### 根本原因

Zeabur 採反向代理架構：

```
外部請求 https://patient-journey.zeabur.app/api/auth/callback
    ↓ Zeabur 反向代理
    ↓ 轉發到內部 Node.js
req.url = "http://localhost:8080/api/auth/callback?code=...&state=..."
```

Next.js App Router 的 `req.url` 反映的是**內部** localhost:8080，而非公開 domain。

舊程式碼直接從 `req.url` 取 origin：

```typescript
// ❌ 錯誤 — req.url = http://localhost:8080/...
return NextResponse.redirect(new URL('/dashboard', req.url));
// → redirect 到 http://localhost:8080/dashboard
```

### 修法

**`src/app/api/auth/callback/route.ts`**：

```typescript
// ✅ 使用 NEXT_PUBLIC_BASE_URL，fallback 至 x-forwarded headers
const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ??
  `${req.headers.get('x-forwarded-proto') ?? 'https'}://${
    req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  }`;
return NextResponse.redirect(new URL('/dashboard', baseUrl));
```

**必要條件**：`NEXT_PUBLIC_BASE_URL` 須在 Zeabur 環境變數中正確設定：

```
NEXT_PUBLIC_BASE_URL=https://patient-journey.zeabur.app
```

**原則**：任何需要產生公開 URL 的 server-side 程式碼，不可信任 `req.url`；改用 `NEXT_PUBLIC_BASE_URL` 或 `x-forwarded-*` headers。

---

## 5. Zeabur 環境變數設定方法

### 必填變數一覽

| 變數 | 說明 | 範例值 |
|------|------|--------|
| `SESSION_SECRET` | iron-session 加密金鑰，≥32 字元 | `e49aeee...` |
| `LLM_PROVIDER` | AI 提供者 | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API key | `sk-...` |
| `ANTHROPIC_API_KEY` | Claude API key（deepseek 模式可填 placeholder） | `sk-ant-placeholder` |
| `SMART_CLIENT_ID` | FHIR OAuth client ID | `patient-journey-poc` |
| `FHIR_ISS` | FHIR server base URL（含 sim context） | 見下方說明 |
| `SMART_REDIRECT_URI` | OAuth callback URL | `https://<domain>/api/auth/callback` |
| `SMART_SCOPES` | OAuth scope | `launch openid fhirUser patient/*.read offline_access` |
| `ALLOWED_EHR_ORIGINS` | CDS Hooks CORS | `*` |
| `NEXT_PUBLIC_BASE_URL` | 公開 domain（用於 server-side redirect） | `https://<domain>` |

### FHIR_ISS 注意事項

SMART Health IT sandbox 使用 **帶 sim context 的 URL**，裸 URL 無病人資料：

```
# ❌ 裸 URL（Standalone Launch 會出現 SyntaxError）
https://launch.smarthealthit.org/v/r4/fhir

# ✅ 帶 sim context（含預設病人 Daniel Adams）
https://launch.smarthealthit.org/v/r4/sim/WzIsIkRhbmllbCBBZGFtcyIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir
```

---

## 6. 部署流程與觸發方式

### 正常部署流程

```
git push origin main
    ↓
GitHub Actions CI（typecheck + build，~2 分鐘）
    ↓ CI 通過
Zeabur 自動拉 main 重新 build image（~3-5 分鐘）
    ↓
服務重啟，新版本上線
```

### 強制重新部署（環境變數更新後）

```bash
git commit --allow-empty -m "chore: trigger redeploy"
git push origin main
```

### 確認部署狀態

```bash
gh run list --limit 3 --repo <owner>/patient-journey
```

### Zeabur 網路設定（myCloud）

| 項目 | 值 |
|------|-----|
| 內網主機名稱 | `patient-journey.zeabur.internal` |
| 內網連接埠 | HTTP:8080（由 `PORT=${WEB_PORT}` 注入） |
| 公有網域 | `patient-journey.zeabur.app` |
| CI 工作流程 | `.github/workflows/ci.yml` |
