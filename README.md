# Patient Journey — 病人就醫歷程智慧平台

以「時間軸為核心」整合病人生命徵象、檢驗、影像與用藥，並以事件驅動架構在臨床決策當下主動示警。本 repo 為 **Next.js + BFF + SMART on FHIR (TW Core)** 的 POC 骨架。

## 架構鳥瞰

```
裝置 (RWD) ─▶ ① 前端 (Next.js)
                 │
                 ▼
            ② BFF (Route Handlers)  ← 本階段重點 (T2.0~T2.6)
             · OAuth2 / SMART launch
             · Session / Token 生命週期
             · FHIR Proxy
                 │
       ┌─────────┼──────────────┐
       ▼         ▼              ▼
  ③ HAPI FHIR  ④ CDS Hooks   ⑤ AI 服務
   (TW Core)   (事件驅動安全)  (語音→FHIR / 摘要)
```

| 區塊 | 狀態 |
|------|------|
| ① 前端 POC (`src/components/PatientJourney.jsx`) | ✅ 完整可運行 |
| ② BFF + OAuth2 (`src/app/api/auth/*`, `src/lib/*`) | ✅ 本階段完成 |
| ③ FHIR 映射 (`src/lib/fhir/mappers.ts`) | 🔲 佔位，待 `/tasks ③` |
| ④ CDS Hooks 安全引擎 | 🔲 待後續階段 |
| ⑤ AI 服務 | ⚠️ 前端模擬版 |

## 快速開始

```bash
cp .env.example .env.local   # 填入 FHIR_ISS / SMART_CLIENT_ID / SESSION_SECRET
npm install
npm run dev                  # http://localhost:3000
```

預設 `FHIR_ISS` 指向公開測試站 SMART Launcher（R4），可直接走 Standalone Launch 流程驗證 OAuth2。

## SMART on FHIR 授權流程 (② BFF)

```
首頁 / HIS ──▶ /api/auth/launch    探索 smart-config + PKCE + state，302 至授權端點
授權端點   ──▶ /api/auth/callback  驗 state、code+verifier 換 token、存伺服端 session
/dashboard ──▶ /api/fhir/[...path] BFF 代理附 Bearer，前端零 token 暴露
```

## 目錄結構

```
src/
├── app/
│   ├── api/
│   │   ├── health/route.ts            # T2.0 健康檢查
│   │   ├── auth/launch/route.ts       # T2.2 Launch 入口 (PKCE+state)
│   │   ├── auth/callback/route.ts     # T2.3 Token 交換
│   │   ├── auth/logout/route.ts       # T2.4 登出
│   │   └── fhir/[...path]/route.ts    # T2.5 FHIR Proxy
│   ├── dashboard/page.tsx             # T2.6 授權落點
│   ├── page.tsx                       # Launch 入口頁
│   └── layout.tsx / globals.css
├── components/PatientJourney.jsx      # ① 前端 POC 儀表板
├── lib/
│   ├── smart/{discovery,pkce,tokenExchange}.ts
│   ├── session/store.ts               # iron-session + token 生命週期
│   └── fhir/{client,mappers,mock}.ts  # Proxy fetch / ③映射佔位 / fallback
└── types/smart.ts
```

## 安全要點

PKCE (S256) 防授權碼攔截 · `state` 防 CSRF · access_token 僅存伺服端、cookie 為 HttpOnly/Secure/SameSite · FHIR 一律經 BFF 代理 · refresh_token 自動續期。

## 路線圖

- [x] ② BFF + OAuth2 / SMART launch
- [ ] ③ FHIR 資料映射（`mappers.ts` → ViewModel）
- [ ] ④ CDS Hooks 安全引擎（order-select / order-sign）
- [ ] ⑤ AI 服務（語音轉 FHIR、智慧摘要服務化）

## 範圍聲明

POC / Demo，使用模擬資料，**無真實病人個資**，未串接正式 HIS/EHR。

## License

MIT
