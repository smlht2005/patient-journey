# SMART Standalone Launch 疑難排解指南

## 問題描述

在 Zeabur 生產環境完成 SMART on FHIR Standalone Launch 授權流程後，
Dashboard 仍顯示黃色 Banner「⚠️ 展示模式（Mock 資料）」，無法切換至真實 FHIR 資料。

---

## 診斷工具

部署期間可使用診斷端點（**生產環境請用後刪除**）：

```
GET /api/debug/session
```

回傳範例（修正前）：
```json
{
  "hasAccessToken": true,
  "hasPatientId": false,
  "isTokenValid": true,
  "patientId": "(empty)",
  "jwtClaims": {
    "fhirUser": "Practitioner/99170ec7-...",
    "context": { "need_patient_banner": true }
  },
  "fhirPatientQuery": { "status": 200, "entries": [...] }
}
```

回傳範例（修正後）：
```json
{
  "hasAccessToken": true,
  "hasPatientId": true,
  "isTokenValid": true,
  "patientId": "274b7371-cb91-4b85-82a2-eabc4aa77779"
}
```

---

## 問題一：Dashboard 仍顯示 Mock 模式

### 症狀

```
Banner：⚠️ 展示模式（Mock 資料）
session.hasPatientId = false
```

### 根本原因

**SMART Standalone Launch 的 token response 不包含 `patient` claim。**

SMART on FHIR 規格說明：
- **EHR Launch**：EHR 系統在啟動時帶入病人 context（`launch` token），授權伺服器回傳 `patient` claim ✅
- **Standalone Launch**：無 EHR 提供的病人 context，token response 中**不保證**有 `patient` 欄位 ❌

確認方式：解碼 JWT access token 的 payload：
```json
{
  "scope": "openid fhirUser patient/*.read offline_access",
  "fhirUser": "Practitioner/xxx",
  "context": { "need_patient_banner": true }
  // ← 無 "patient" 欄位
}
```

`context.need_patient_banner: true` 明確表示「此 session 尚未綁定病人，需要 App 顯示病人選擇 banner」。

### 修法

在 `src/app/api/auth/callback/route.ts` 換 token 完成後立即查詢 FHIR 取第一筆 Patient：

```typescript
// token.patient 有值 → 用 token 的；無值 → 立即查 FHIR
let patientId = token.patient;
if (!patientId && session.iss) {
  try {
    const base = session.iss.replace(/\/+$/, '');
    const ptRes = await fetch(`${base}/Patient?_count=1`, {
      headers: {
        Accept:        'application/fhir+json',
        Authorization: `Bearer ${token.access_token}`,
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (ptRes.ok) {
      const bundle = await ptRes.json();
      patientId = bundle.entry?.[0]?.resource?.id;
    }
  } catch (e) {
    console.error('[callback] patient auto-discover 失敗:', e);
  }
}
session.patientId = patientId;
```

**關鍵**：放在 callback route（token 剛交換完畢），不要放在 dashboard Server Component，原因：
- callback route 的 session 寫入最可靠
- FHIR query 用 fresh token，不依賴 session 狀態
- 若放在 dashboard，`_sort=-_lastUpdated` 等參數可能不被 sandbox 支援而靜默失敗

---

## 問題二：Logout GET → localhost:8080（ERR_CONNECTION_REFUSED）

### 症狀

```
瀏覽器開啟 https://patient-journey.zeabur.app/api/auth/logout
→ 跳轉至 http://localhost:8080/
→ ERR_CONNECTION_REFUSED
```

### 根本原因

Zeabur 反向代理架構：

```
外部 → https://patient-journey.zeabur.app
           ↓ Zeabur Reverse Proxy
       http://localhost:8080 (Next.js app 內部地址)
```

`req.url`（或 `new URL(req.url).origin`）取到的是**內部** `http://localhost:8080`，
而非公開 domain。所有需要產生公開 URL 的端點都會受影響。

### 修法

使用 `NEXT_PUBLIC_BASE_URL` 環境變數取代 `req.url`：

```typescript
// ❌ 錯誤 — req.url 在 Zeabur 為 http://localhost:8080/...
const origin = new URL(req.url).origin;
return NextResponse.redirect(`${origin}/`);

// ✅ 正確 — 使用公開 domain
const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ??
  `${req.headers.get('x-forwarded-proto') ?? 'https'}://` +
  `${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`;
return NextResponse.redirect(`${baseUrl}/`);
```

**受影響的三個端點（已全部修正）：**

| 端點 | 用途 |
|------|------|
| `/api/auth/callback` | OAuth code 換 token 後 redirect 到 `/dashboard` |
| `/api/auth/logout` GET | 登出後 redirect 到首頁 |
| `/api/auth/dev-login` | Dev mode 設 session 後 redirect 到 `/dashboard` |

**必填環境變數：**

```env
NEXT_PUBLIC_BASE_URL=https://patient-journey.zeabur.app
```

---

## 問題三：Zeabur `variable env` 覆蓋刪除所有變數

### 症狀

```
HTTP 500
Error: [Patient Journey] SESSION_SECRET 未設定
```

### 根本原因

`npx zeabur variable env -f <file> --id <service-id>` 是**覆蓋（overwrite）**語意，
會以檔案內容取代所有現有變數，檔案外的 key 全部刪除。

```bash
# ❌ 只含 FHIR_ISS 的 patch 檔 → 其他 9 個變數全部消失
npx zeabur variable env -f .env.zeabur-patch --id <service-id>
```

### 修法

修改單一變數時，使用包含**全部變數**的完整 `.env` 檔：

```bash
# ✅ 使用完整 .env.production（含所有 10 個 key）
npx zeabur variable env -f .env.production --id <service-id>
```

或使用 `variable update` 指令修改單一 key（需互動式選單）：
```bash
npx zeabur variable update -n patient-journey -y \
  -k "FHIR_ISS=https://..."
```

**必備的完整變數清單：**

| Key | 說明 |
|-----|------|
| `SESSION_SECRET` | iron-session 加密金鑰（≥32 字元） |
| `FHIR_ISS` | FHIR Server URL（含 sim context） |
| `SMART_CLIENT_ID` | OAuth client ID |
| `SMART_REDIRECT_URI` | `https://<domain>/api/auth/callback` |
| `SMART_SCOPES` | OAuth scope |
| `LLM_PROVIDER` | `deepseek` 或 `claude` |
| `DEEPSEEK_API_KEY` | DeepSeek API key |
| `ANTHROPIC_API_KEY` | Claude API key |
| `NEXT_PUBLIC_BASE_URL` | `https://<domain>` |
| `ALLOWED_EHR_ORIGINS` | CDS Hooks CORS |

---

## 問題四：Zeabur CLI 部署被 REMOVED / CANCELED

### 症狀

```bash
npx zeabur deployment list --json
→ status: "REMOVED"  # 最新部署未生效
→ 舊版本仍在 RUNNING
```

### 根本原因

多次 `npx zeabur deploy` 相互競爭，較新的部署會取消前一個。
GitHub webhook 有時也未觸發（Zeabur 的 webhook 接收問題）。

### 診斷

```bash
# 確認目前 RUNNING 的是哪個版本
npx zeabur deployment list --json | grep -E '"status"|"commitSHA"'
```

### 修法

1. 等前一個部署完成（`RUNNING`）再觸發下一個
2. 確認只執行一次 `npx zeabur deploy`
3. 使用 polling 確認部署已 RUNNING：

```bash
until [ "$(npx zeabur deployment list --json | grep '"status"' | head -1 | tr -d ' ",' | cut -d: -f2)" = "RUNNING" ]; do
  sleep 30; echo "waiting..."
done
echo "Deployed!"
```

---

## FHIR_ISS sim URL 格式說明

SMART Health IT sandbox 的 sim URL 格式：

```
https://launch.smarthealthit.org/v/r4/sim/<base64>/fhir
```

base64 解碼為 JSON 陣列：
```json
[
  2,                                              // R4
  "Daniel Adams",                                 // 病人姓名
  "99170ec7-3de4-419f-8c35-d95ac3b4fe6b",       // 病人 FHIR ID（空字串 = AUTO）
  "AUTO",                                         // 自動選擇模式
  0, 0, 0, "", "", "", "", "", "", "", 0, 1, ""
]
```

> **注意**：index 2 的 ID 是 **Practitioner** 的 FHIR ID，不是 Patient ID。
> Standalone Launch 即使指定此 ID，token response 仍**不回傳** `patient` claim。
> 需透過 callback route 主動查詢 `Patient?_count=1` 取得。

---

## 完整 OAuth 流程排查步驟

```
1. 開啟 /api/auth/logout → 確認跳回首頁（非 localhost:8080）
2. 點「以 SMART on FHIR 啟動」
3. SMART Health IT 登入（任意密碼）
4. Authorize App Launch → Approve
5. 開啟 /api/debug/session：
   - hasAccessToken: true  ✅
   - hasPatientId: true    ✅（修正後才有）
   - isTokenValid: true    ✅
6. 開啟 /dashboard → 綠色 Banner ✅
```

---

## 參考文件

- `docs/troubleshooting-zeabur-deploy.md` — Zeabur 部署疑難排解
- `docs/troubleshooting-smart-auth.md` — SMART on FHIR 授權流程
- `src/app/api/auth/callback/route.ts` — Patient auto-discover 實作
- `src/app/api/debug/session/route.ts` — 診斷端點（驗證完成後刪除）
