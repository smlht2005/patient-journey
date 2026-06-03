# deploy-skill — Zeabur 部署 SOP

Description: 用於處理 Zeabur 部署、環境變數管理與 HAPI FHIR Docker 整合。

---

## Zeabur 基本資訊

| 項目 | 值 |
|------|----|
| 生產網址 | `https://patient-journey.zeabur.app` |
| 內部 port | `8080`（`PORT` 由 Zeabur 自動注入） |
| Service ID | `6a1cb5a07a8a8f2f602163f2` |
| Environment ID | `6a1cb515b764eebf4f53b5c6` |
| Project ID | `6a1cb5154853e1f02a13737e` |

---

## 部署方式

### 方式 A：GitHub push（自動）
```bash
git push origin main
# CI：typecheck → build → Zeabur 自動部署
```
若 webhook 未觸發，改用方式 B。

### 方式 B：CLI 強制部署
```bash
npx zeabur deploy \
  --service-id 6a1cb5a07a8a8f2f602163f2 \
  --environment-id 6a1cb515b764eebf4f53b5c6 \
  --project-id 6a1cb5154853e1f02a13737e
```

### 確認部署完成（polling）
```bash
until [ "$(npx zeabur deployment list --json | grep '"status"' | head -1 | tr -d ' ",' | cut -d: -f2)" = "RUNNING" ]; do
  echo "等待中…"; sleep 30
done
echo "✅ 部署完成"
```

---

## ⚠️ 環境變數：overwrite 陷阱

`npx zeabur variable env -f <file>` **是 overwrite，不是 update。**
執行後，**只有檔案中的 key 存在**，其餘全部刪除。

**每次更新環境變數，必須使用包含所有 key 的完整檔案：**

```bash
# 先確認當前變數
npx zeabur variable list

# 以完整 .env 覆蓋（確保所有 10 個 key 都在檔案中）
npx zeabur variable env -f .env.production
```

### 完整 10 個環境變數清單

```env
FHIR_ISS=https://launch.smarthealthit.org/v/r4/sim/<sim-context>/fhir
SMART_CLIENT_ID=patient-journey-poc
SMART_REDIRECT_URI=https://patient-journey.zeabur.app/api/auth/callback
SMART_SCOPES=launch openid fhirUser patient/*.read offline_access
SESSION_SECRET=<32 字元以上隨機字串>
ALLOWED_EHR_ORIGINS=*
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=<sk-...>
ANTHROPIC_API_KEY=sk-ant-placeholder
NEXT_PUBLIC_BASE_URL=https://patient-journey.zeabur.app
```

---

## FHIR_ISS sim URL 格式

```
https://launch.smarthealthit.org/v/r4/sim/<base64>/fhir
```

base64 = JSON array：`[2,"Daniel Adams","<practitionerFhirId>","AUTO",0,0,0,...,0,1,""]`

- index 2 = Practitioner FHIR ID（不是 Patient ID）
- 嵌入 Practitioner ID 不影響 `patient` claim（Standalone Launch 永遠不含 patient）

---

## HAPI FHIR Docker（本機）

```bash
# 啟動
docker run -p 9090:8080 hapiproject/hapi:latest

# FHIR base（根路徑 / 是 Web UI，FHIR API 在 /fhir）
http://localhost:9090/fhir

# Seed 測試病人
npm run seed:fhir
npm run seed:fhir -- --name=王大華 --fhir=http://localhost:9090/fhir

# 確認資料
curl http://localhost:9090/fhir/Patient?_count=5
```

---

## CI 設定（`.github/workflows/ci.yml`）

CI build 使用假值通過，實際值在 Zeabur Dashboard 設定：

```yaml
env:
  SESSION_SECRET: ci_only_secret_not_used_in_production_00000
  ANTHROPIC_API_KEY: sk-ant-ci-placeholder
  FHIR_ISS: https://launch.smarthealthit.org/v/r4/fhir
  # …其他 key
```

CI 不部署（只 build + typecheck）；Zeabur 自動從 main branch 觸發。

---

## 常見問題

| 問題 | 原因 | 修法 |
|------|------|------|
| OAuth callback redirect 到 `localhost:8080` | Zeabur 反向代理讓 `req.url` 變內部地址 | 使用 `NEXT_PUBLIC_BASE_URL` 產生 redirect URL |
| Build 失敗：Export encountered errors | `cookies()` 的路由未加 `force-dynamic` | 加 `export const dynamic = 'force-dynamic'` |
| 部署後 500：SESSION_SECRET 未設定 | `variable env` overwrite 刪掉了 key | 用完整 10 個 key 的 `.env` 重跑 `variable env` |
| Deployment REMOVED/CANCELED | 多個 CLI deploy 競爭互相取消 | 等前一次 RUNNING 後再執行 |
