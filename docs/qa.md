# Q&A — 常見問題彙整

> 開發過程累積的問答，補充 `troubleshooting-*.md` 未涵蓋的概念性問題。

---

## Q1. SMART 授權失敗：`Invalid launch options: SyntaxError: Unexpected end of JSON input`

完整錯誤（退回 callback）：

```
/api/auth/callback?error=invalid_request
  &error_description=Invalid+launch+options%3A+SyntaxError%3A+Unexpected+end+of+JSON+input
  &state=...
```

### 病因

`FHIR_ISS` 設成**裸 URL**，缺少 `/sim/<base64>/` 區段：

```env
# ❌ 裸 URL — 無 sim context
FHIR_ISS=https://launch.smarthealthit.org/v/r4/fhir
```

SMART Health IT sandbox 的 authorize endpoint 會嘗試從 sim context 解碼 launch options
（base64 → JSON）。裸 URL 沒有這段資料 → 解出空字串 → `JSON.parse('')` 拋出
`Unexpected end of JSON input` → 以 `error=invalid_request` 退回 callback。

### 修法

`FHIR_ISS` 必須帶 sim context：

```env
# ✅ 含 sim context（base64 編碼 launch options）
FHIR_ISS=https://launch.smarthealthit.org/v/r4/sim/<base64>/fhir
```

改完 `.env.local` 後**必須重啟 dev server**（env var 在啟動時讀取）。

### 補充

- sim base64 解碼為 JSON 陣列，index 2 是 **Practitioner** FHIR ID（不是 Patient）。
- Standalone Launch **不回傳** `patient` claim，由 `callback/route.ts` 以
  `GET /Patient?_count=1` 自動補齊。
- 可開 `/api/debug/session` 確認 `hasPatientId: true`。
- 詳見 `docs/troubleshooting-smart-standalone-launch.md`「FHIR_ISS sim URL 格式說明」。

---

## Q2. `SESSION_SECRET` 是什麼？做什麼用？

它是 **iron-session 用來「加密 + 簽章」cookie 的密鑰**，直接餵給 iron-session 的
`password` 欄位（`src/lib/session/store.ts`）。

### 它保護什麼

登入成功後，App 不把 session 存在伺服器資料庫，而是把整個 session 狀態塞進一個叫
`pj_session` 的 cookie，存在使用者瀏覽器。cookie 裡裝著敏感資料（`SmartSession`）：

- `accessToken` / `refreshToken`（FHIR OAuth token）
- `patientId`、`iss`、`practitionerName`
- `codeVerifier`、`state`（OAuth PKCE / CSRF 用）

iron-session 用 `SESSION_SECRET` 把這包 JSON 對稱加密（AES）並加上簽章，才寫進 cookie：

| 沒有 secret 就無法… | 效果 |
|---|---|
| **解密** | 瀏覽器 / 攻擊者打開 cookie 只看到亂碼，看不到 access token |
| **偽造** | 改一個 byte 簽章就對不上，伺服器拒絕 → 無法竄改 `patientId` 假冒病人 |

**比喻**：cookie 是一個上鎖的保險箱，交給病人自己帶來帶去；`SESSION_SECRET` 是這把鎖的
鑰匙，只有伺服器有。病人拿著保險箱卻打不開、也撬不動。

### 關鍵點

1. **≥ 32 字元**：iron-session 硬性要求（AES 金鑰長度），太短會報錯。
2. **生產環境缺它就拒絕啟動**：`store.ts` 在 request time 檢查，production 未設則丟錯
   （CLAUDE.md「Critical Rule #2」：檢查必須在函式內，不能在 module 頂層，否則 build 失敗）。
3. **本機有 fallback**：`store.ts` 的 `?? 'dev_only_secret_...'`，dev 環境不設也能跑。
4. **換掉 secret = 所有人被登出**：舊 cookie 用舊鑰匙加密，新鑰匙解不開 → 全部失效。
   生產環境的 secret 一旦定下就不要隨意換。

### 產生安全值

```powershell
# PowerShell：48 byte 隨機字串（base64）
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

```bash
# Node
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

部署到 Zeabur 前**務必**設一個真正隨機的值。

---

## Q3. 語音醫囑簽署成功（已開立至 FHIR · {id}）後，如何回查那筆資料？

簽署成功的綠色提示「已開立至 FHIR · 4709522」代表這張 MedicationRequest 在 FHIR server
取得 id `4709522`。回查最可靠的方式是透過 App 的 **BFF Proxy**（`/api/fhir/[...path]`），
它會自動帶上目前 session 的 Bearer token，打到的正是寫入時的同一台 server。

### 方法 1 — 瀏覽器查單筆（最快）

在**同一個已登入的瀏覽器分頁**開：

```
http://localhost:3000/api/fhir/MedicationRequest/4709522
```

回傳完整 FHIR JSON，重點欄位：

- `"id": "4709522"`
- `"status": "active"` — 簽署時從 `draft` 改成 `active`，代表正式開立
- `"medicationCodeableConcept.text"`、`subject.reference`

> ⚠️ 必須用**有登入 session 的瀏覽器**開。Proxy 靠 `pj_session` cookie 取 token；
> 用 curl / 無痕視窗沒帶 cookie 會回 401。

### 方法 2 — 查該病人所有醫囑（確認新筆有進清單）

```
http://localhost:3000/api/fhir/MedicationRequest?subject=Patient/<patientId>&_sort=-_lastUpdated
```

回傳 Bundle，最新一筆即為剛簽署的醫囑。

### 方法 3 — 新醫囑沒出現在「病人歷程時間軸」

Dashboard 是 **Server Component**，資料在頁面載入時抓好，不會即時刷新。
**重新整理 `/dashboard`（F5）** 後 `patient-summary` 會重撈，新醫囑才會進時間軸「用藥」區。

### 注意

- 寫入路徑：簽署走 `POST /api/fhir/MedicationRequest`，token 由 BFF 伺服端附加（前端零暴露）。
- 只有有效 session（dev-login / dev-connect 的 `dev-no-auth` 或 SMART OAuth）下才寫得進；
  Mock 模式回 401。
- SMART Health IT sandbox 資料會定期重置，寫入僅供 demo 驗證，非長期保存。

---

## Q4. 用搜尋框輸入 Patient ID 切換病人，卻顯示錯誤病人（Mock 陳大明）？

### 症狀

在 SMART OAuth 模式下，於 header 搜尋框輸入正確的 Patient ID 切換，結果跳出黃色
「展示模式（Mock 資料）」banner，畫面變成 mock 病人陳大明。

### 根本原因

「切換病人」原本導向 `dev-login`，而 `dev-login` 會**覆寫整個 session**：

```js
session.accessToken = 'dev-no-auth';   // ⚠️ 真實 SMART OAuth Bearer token 被砍掉
```

連鎖反應：

```
1. accessToken 變成 'dev-no-auth'
2. fhirFetch 看到 'dev-no-auth' → 跳過 Bearer token，直連 iss（CLAUDE.md Rule #5）
3. iss 是「需要授權」的 SMART Health IT sandbox → 無 token 讀取被擋（401/403）
4. Patient fetch 失敗 → source='mock-fallback' → 回 MOCK_SUMMARY（陳大明）
```

`dev-login` 的 `dev-no-auth` 直連，只適用**免授權**的 FHIR server（本機 HAPI Docker、
開放的 TW Core sandbox）；用在需要 OAuth 的 SMART sandbox 上就會把 token 砍掉而壞掉。

### 修法（已實作）

- **Fix A — 安全閘**（`dashboard/page.tsx`）：切換框僅在 dev-no-auth session 顯示。
  ```js
  const canSwitchPatient = process.env.NODE_ENV !== 'production' && isDev;
  ```
  SMART OAuth 模式下隱藏（病人本來就由 OAuth 自動綁定，不需切換）。

- **Fix B — token-preserving 切換**（`PatientJourneyDashboard.tsx` + `dashboard/page.tsx`）：
  切換改導向 `/dashboard?patientId=X`，不再經 `dev-login`。`page.tsx` 讀 `searchParams.patientId`
  覆寫 `session.patientId`，**保留原本的 accessToken**，不重建 session。
  ```js
  const switchTo = searchParams.patientId?.trim();
  if (switchTo && switchTo !== session.patientId) {
    session.patientId = switchTo;
    await session.save();
  }
  ```

### 行為對照

| 模式 | 修法前 | 修法後 |
|------|--------|--------|
| SMART OAuth | 顯示切換框 → 一用就 fallback 成 mock | 隱藏切換框（病人由 OAuth 綁定） |
| Dev（local/twcore） | 經 dev-login 重建 session | `/dashboard?patientId=X`，保留 token 乾淨切換 |
