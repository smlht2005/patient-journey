# SOP — Claude Code 新 Session 快捷鍵設定

## 適用環境

- OS：Windows 11
- Terminal：Windows Terminal（Microsoft Store 版）
- Shell：Windows PowerShell

---

## 目標

按下 `Ctrl+Alt+N` 即可在 Windows Terminal 開新分頁，自動進入 `C:\Development\HISCore\patient-journey` 並啟動 Claude Code（全新 session）。

---

## 設定步驟

### Step 1 — 開啟 Windows Terminal settings.json

方法 A（快捷鍵）：
```
Ctrl+,  →  左下角「開啟 JSON 檔案」
```

方法 B（直接開啟）：
```
C:\Users\<username>\AppData\Local\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json
```

---

### Step 2 — 新增 Action（在 `actions` 陣列加入）

```json
{
    "command": {
        "action": "newTab",
        "commandline": "powershell.exe -NoExit -Command \"Set-Location 'C:\\Development\\HISCore\\patient-journey'; claude\"",
        "tabTitle": "Claude Code"
    },
    "id": "User.newClaudeTab"
}
```

---

### Step 3 — 新增 Keybinding（在 `keybindings` 陣列加入）

```json
{
    "id": "User.newClaudeTab",
    "keys": "ctrl+alt+n"
}
```

---

### Step 4 — 完整範例（settings.json 結構）

```json
{
    "actions": [
        { "command": { "action": "copy", "singleLine": false }, "id": "User.copy.644BA8F2" },
        { "command": "paste", "id": "User.paste" },
        { "command": { "action": "splitPane", "split": "auto", "splitMode": "duplicate" }, "id": "User.splitPane.A6751878" },
        { "command": "find", "id": "User.find" },
        {
            "command": {
                "action": "newTab",
                "commandline": "powershell.exe -NoExit -Command \"Set-Location 'C:\\Development\\HISCore\\patient-journey'; claude\"",
                "tabTitle": "Claude Code"
            },
            "id": "User.newClaudeTab"
        }
    ],
    "keybindings": [
        { "id": "User.copy.644BA8F2", "keys": "ctrl+c" },
        { "id": "User.find", "keys": "ctrl+shift+f" },
        { "id": "User.paste", "keys": "ctrl+v" },
        { "id": "User.splitPane.A6751878", "keys": "alt+shift+d" },
        { "id": "User.newClaudeTab", "keys": "ctrl+alt+n" }
    ]
}
```

---

### Step 5 — 儲存並驗證

1. 儲存 `settings.json`（Windows Terminal **立即生效**，不需重啟）
2. 按下 `Ctrl+Alt+N`
3. 預期：開新分頁，標題顯示「Claude Code」，自動 `cd` 到專案目錄並啟動 `claude`

---

## 其他 Session 管理方式

| 方式 | 指令 / 動作 | 效果 |
|------|------------|------|
| 清除對話歷史 | `/clear` | 清除 context，同一 process |
| 全新 session | `Ctrl+Alt+N`（本 SOP） | 新分頁 + 全新 claude process |
| 手動開新分頁 | `Ctrl+Shift+T`（預設） | 新分頁，手動輸入 `claude` |
| 離開 claude | `Ctrl+C` 或 `/exit` | 結束目前 session |

---

## 修改快捷鍵

如需更換按鍵組合，只修改 `keybindings` 中的 `"keys"` 值即可：

```json
{ "id": "User.newClaudeTab", "keys": "ctrl+shift+c" }
```

常見替換選項：`ctrl+alt+c`、`ctrl+shift+n`、`alt+n`

---

## 注意事項

- 若同時有多個專案，可複製同樣的 action + keybinding，修改 `commandline` 的路徑與 `id` 名稱
- `tabTitle` 為選填，可改為任意名稱（例如「patient-journey CC」）
- Windows Terminal 設定即時生效，無需重啟
