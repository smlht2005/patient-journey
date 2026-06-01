# SMART on FHIR 授權流程 — 疑難排解指南

> 最後更新：2026-06-01  
> 環境：Next.js 14 + SMART Health IT Sandbox (R4) + iron-session

---

## 目錄

1. [快速診斷清單](#1-快速診斷清單)
2. [錯誤一：Invalid launch options / SyntaxError](#2-錯誤一invalid-launch-options--syntaxerror)
3. [錯誤二：state 驗證失敗（CSRF 防護）誤判](#3-錯誤二state-驗證失敗csrf-防護誤判)
4. [錯誤三：SMART 服務暫時無法連線（503/504）](#4-錯誤三smart-服務暫時無法連線-503504)
5. [錯誤四：不允許的 ISS protocol（400）](#5-錯誤四不允許的-iss-protocol-400)
6. [正確的 ISS URL 取得方式](#6-正確的-iss-url-取得方式)
7. [Scope 設定規則](#7-scope-設定規則)
8. [Session 相關問題](#8-session-相關問題)
9. [完整 OAuth 流程說明](#9-完整-oauth-流程說明)

---

## 1. 快速診斷清單

瀏覽器打開 `http://localhost:3000` 後點「以 SMART on FHIR 啟動」，若出現問題先依序確認：

```
□ .env.local 存在且有正確 FHIR_ISS（含 sim context，見 §6）
□ FHIR_ISS 格式含 /sim/eyJ.../ 路徑段
□ SMART_REDIRECT_URI 與 Next.js 監聽 port 一致（預設 3000）
□ SESSION_SECRET 長度 ≥ 32 字元
□ dev server 在修改 .env.local 後已重啟
□ 瀏覽器未快取舊的 pj_session cookie（清除再試）
```

---

## 2. 錯誤一：Invalid launch options / SyntaxError

### 症狀

```
GET /api/auth/callback?error=invalid_request
  &error_description=Invalid+launch+options%3A+SyntaxError%3A+Unexpected+end+of+JSON+input
  &state=xxxx
→ HTTP 400 {"error":"授權失敗：Invalid launch options: SyntaxError: Unexpected end of JSON input"}
```

### 根本原因

`FHIR_ISS` 使用的是**裸端點**（bare endpoint），例如：

```
# ❌ 錯誤：裸端點，無 sim context
FHIR_ISS=https://launch.smarthealthit.org/v/r4/fhir
```

SMART Health IT sandbox 的授權伺服器在處理 authorize request 時，會從 ISS URL 中解析嵌入的 sim context JSON（base64url 編碼）。裸端點沒有此資訊，伺服器嘗試解析空字串，拋出 `SyntaxError: Unexpected end of JSON input`，並透過 OAuth error response 回傳給 callback。

### 解法

使用含 sim context 的 ISS URL（詳見 [§6](#6-正確的-iss-url-取得方式)）：

```
# ✅ 正確：含 /sim/eyJ.../ 路徑
FHIR_ISS=https://launch.smarthealthit.org/v/r4/sim/WzIsIkRhbmllbCBBZGFtcyIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir
```

修改後**必須重啟 dev server**（`Ctrl+C` → `npm run dev`）。

### 補充說明

此錯誤訊息原本在修正前會被誤報為 **CSRF 防護錯誤**（因 callback route 沒有先偵測 OAuth error response）。修正後的 `callback/route.ts` 會先攔截 `?error=` 參數，回傳正確的 `授權失敗：...` 訊息。

---

## 3. 錯誤二：state 驗證失敗（CSRF 防護）誤判

### 症狀

```
GET /api/auth/callback?code=xxx&state=yyy
→ HTTP 400 {"error":"state 驗證失敗或缺少授權碼 (CSRF 防護)"}
```

### 可能原因與解法

| 原因 | 診斷方式 | 解法 |
|------|----------|------|
| Session cookie 過期或遺失 | 開 DevTools → Application → Cookies，確認 `pj_session` 存在 | 清除 cookie，從首頁重新啟動 |
| 多次點擊啟動（舊 state 被新的覆蓋） | 確認只啟動一次 | 清除 cookie，重試 |
| `SESSION_SECRET` 在重啟前後改變 | 比對 .env.local 中的值是否一致 | 統一 secret，重啟後重試 |
| OAuth server 回傳的是 error response（無 `code`）| 確認 callback URL 是否含 `?error=` 而非 `?code=` | 依 §2 或 §4 處理對應錯誤 |

### 注意

若 callback URL 形如 `?error=invalid_request&state=xxx`（**有** `error`，**無** `code`），這**不是** CSRF 問題，而是授權伺服器拒絕了授權請求。請查看 `error_description` 欄位取得真正原因。

---

## 4. 錯誤三：SMART 服務暫時無法連線（503/504）

### 症狀

```
GET /api/auth/launch
→ HTTP 503 {"error":"SMART 服務暫時無法連線，請稍後再試"}
→ HTTP 504 {"error":"SMART 服務暫時無法連線，請稍後再試"}  ← 逾時
```

### 原因

`discoverSmartConfig()` 向 `{ISS}/.well-known/smart-configuration` 發出請求，但：
- **503**：上游 SMART 伺服器回傳 4xx/5xx
- **504**：請求超過 8 秒 timeout（`AbortSignal.timeout(8000)`）

### 解法

1. 確認 SMART Health IT sandbox 是否正常：瀏覽器直接開啟 `https://launch.smarthealthit.org/v/r4/sim/.../fhir/.well-known/smart-configuration`，應回傳 JSON
2. 確認本機網路可連外
3. 若為暫時性故障，稍後重試

---

## 5. 錯誤四：不允許的 ISS protocol（400）

### 症狀

```
GET /api/auth/launch?iss=ftp://evil.host
→ HTTP 400 {"error":"不允許的 ISS protocol：ftp:（僅允許 http/https）"}
```

### 說明

`discovery.ts` 中的 SSRF 防護會驗證 ISS scheme。僅允許 `http:` 和 `https:`。此為安全機制，非 bug。

生產環境另有額外限制：
- 強制 HTTPS（`http:` 被拒絕）
- 封鎖內網 IP（`localhost`、`127.x.x.x`、`10.x.x.x`、`192.168.x.x`、`172.16.x.x`）

---

## 6. 正確的 ISS URL 取得方式

SMART Health IT sandbox 的 ISS URL 須包含 sim context（`/sim/base64url/` 路徑段）。

### 步驟

1. 開啟 **https://launch.smarthealthit.org/**

2. 在 **"App Launch Options"** 區塊設定：
   - **FHIR Version**：R4
   - **Launch Type**：選 `Standalone Launch`（若為 Standalone）或 `EHR Launch`

3. 在 **"Simulated Patient"** 選擇測試病人（例如 `Daniel Adams`）

4. 在 **"App's Launch URL"** 填入：
   ```
   http://localhost:3000/api/auth/launch
   ```

5. 點擊 **"Launch"** 後，頁面頂部的 **"FHIR Server URL"** 欄位會顯示類似：
   ```
   https://launch.smarthealthit.org/v/r4/sim/WzIsIkRhbmllbCBBZGFtcyIsIiIsIkFVVE8iLDAsMCwwLCIiLCIiLCIiLCIiLCIiLCIiLCIiLDAsMSwiIl0/fhir
   ```

6. 複製此 URL，更新 `.env.local`：
   ```env
   FHIR_ISS=https://launch.smarthealthit.org/v/r4/sim/WzIsIkRhbmll.../fhir
   ```

7. **重啟 dev server**：
   ```bash
   npm run dev
   ```

### Sim Context 格式說明

URL 中的 `WzIs...` 是 base64url 編碼的 JSON 陣列，包含：
- 病人 ID
- Provider
- FHIR 版本代碼
- 各種啟動選項

不同的病人選擇會產生不同的 base64 字串，無需手動構造。

---

## 7. Scope 設定規則

```env
# .env.local 設定
SMART_SCOPES=launch openid fhirUser patient/*.read offline_access
```

| Launch 模式 | `launch` scope | `launch` 參數 | 說明 |
|-------------|---------------|--------------|------|
| **EHR Launch** | ✅ 需要 | ✅ 帶入（EHR 傳來的 opaque token） | 程式自動保留 |
| **Standalone Launch** | ❌ 不需要 | ❌ 不傳 | 程式自動移除 |

`launch/route.ts` 已自動處理：
```typescript
// EHR Launch（有 ?launch= 參數）→ 保留 scope 中的 launch
// Standalone Launch（無 ?launch= 參數）→ 自動移除 'launch' scope
const scopes = launch ? rawScopes : rawScopes.replace(/\blaunch\b\s*/g, '').trim();
```

**不需要手動修改 `SMART_SCOPES`。**

---

## 8. Session 相關問題

### Cookie 未設定 / 立即失效

```env
# 確認 SESSION_SECRET 長度 ≥ 32 字元
SESSION_SECRET=e49aeee35675d948d306ec8bdb34515ba77141883e01de47d0b73a5a8de2a04f
```

Cookie 設定（`src/lib/session/store.ts`）：
- 名稱：`pj_session`
- 最長存活：8 小時（28,800 秒）
- Token 有效性：`Date.now() < expiresAt - 60_000`（保留 60 秒緩衝）

### Token 過期後的行為

Access token 過期時，系統自動使用 `refreshToken` 更新（`src/lib/fhir/client.ts`）。若 refresh 失敗（refresh token 過期或伺服器拒絕），FHIR proxy 回傳 401，dashboard 降級為 mock 資料模式。

### 清除 Session

```bash
# 瀏覽器 DevTools → Application → Cookies → 刪除 pj_session
# 或呼叫 logout API
curl -X POST http://localhost:3000/api/auth/logout
```

---

## 9. 完整 OAuth 流程說明

```
使用者                    Patient Journey BFF              SMART Server
   │                            │                               │
   │  GET /                     │                               │
   │──────────────────────────> │                               │
   │  <HTML 首頁（啟動按鈕）    │                               │
   │                            │                               │
   │  點擊「以 SMART 啟動」     │                               │
   │  GET /api/auth/launch      │                               │
   │──────────────────────────> │                               │
   │                            │  GET /{iss}/.well-known/smart-configuration
   │                            │──────────────────────────────>│
   │                            │  { authorization_endpoint,    │
   │                            │    token_endpoint }           │
   │                            │<──────────────────────────────│
   │                            │                               │
   │                            │  生成 PKCE（verifier, challenge, state）
   │                            │  儲存至 session cookie        │
   │                            │                               │
   │  307 Redirect → authURL    │                               │
   │<──────────────────────────  │                               │
   │                            │                               │
   │  GET {authorization_endpoint}?response_type=code&...       │
   │────────────────────────────────────────────────────────────>
   │                            │                               │
   │  （使用者在 sandbox 選擇病人）                             │
   │                            │                               │
   │  302 → /api/auth/callback?code=xxx&state=yyy               │
   │<────────────────────────────────────────────────────────────
   │                            │                               │
   │  GET /api/auth/callback?code=xxx&state=yyy                 │
   │──────────────────────────> │                               │
   │                            │  驗 state（CSRF）             │
   │                            │  POST {token_endpoint}        │
   │                            │  { code, code_verifier, ... } │
   │                            │──────────────────────────────>│
   │                            │  { access_token,              │
   │                            │    refresh_token,             │
   │                            │    patient }                  │
   │                            │<──────────────────────────────│
   │                            │  儲存 token 至 session        │
   │                            │                               │
   │  302 → /dashboard          │                               │
   │<──────────────────────────  │                               │
   │                            │                               │
   │  GET /dashboard            │                               │
   │──────────────────────────> │                               │
   │                            │  GET /fhir/Patient/{id}       │
   │                            │  GET /fhir/Observation?...    │
   │                            │  GET /fhir/MedicationRequest?...
   │                            │──────────────────────────────>│
   │                            │  FHIR Resources               │
   │                            │<──────────────────────────────│
   │  Dashboard（真實 FHIR 資料）                               │
   │<──────────────────────────  │                               │
```

### 錯誤攔截點

| 攔截點 | 檔案 | 錯誤類型 |
|--------|------|----------|
| ISS 驗證 | `discovery.ts` → `SmartValidationError` | scheme 非法、內網 IP → `launch/route.ts` 回 400 |
| SMART server 故障 | `discovery.ts` → `Error` | 網路逾時、上游 5xx → `launch/route.ts` 回 503/504 |
| OAuth error response | `callback/route.ts` | `?error=` 參數 → 400 + 明確訊息 |
| CSRF 防護 | `callback/route.ts` | state 不符 → 400 |
| Token 交換失敗 | `tokenExchange.ts` | token endpoint 拒絕 → 500 |
