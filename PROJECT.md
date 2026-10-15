# Project: Endfield Assistant Game Data & Rendering Update

## Architecture
本專案為《明日方舟：終末地》Discord 小助手（Endfield Assistant）。
系統核心架構分為四層：
1. **通訊與資料擷取層 (Data Acquisition Layer)**：
   - 負責與森空島（SKPort / Zonai）API 通訊，處理 HMAC-SHA256+MD5 雙層簽名與 Token Refresh。
   - `scripts/fetch_snapshot.js` 負責命令列擷取、參數解析、快照寫入與資產預熱快取。
   - `data/data.json`（角色/幹員/裝備快照）與 `data/indie-hard.json`（影拓豐碑快照）。
2. **資產與快取管理層 (Assets & Cache Layer)**：
   - `assets/images/` 本地靜態圖標庫（職業、屬性、突破、潛能、武器、裝備槽、字型）。
   - `assets/images/dynamic/` 動態資源本地快取（森空島 CDN 圖片自動持久化）。
   - `utils/operatorEnums.js` 本地化枚舉與圖示解析（解耦外部 GitHub Gist 連線）。
3. **指令與渲染引擎層 (Commands & Rendering Layer)**：
   - `commands/game/operators.js` & `utils/operatorsCanvas.js`：全幹員列表 Node-Canvas 原生繪圖渲染。
   - `commands/game/char.js` & `utils/charRender.js`：個別幹員詳細配裝之 Node-Canvas 繪圖渲染。
   - `commands/game/monument.js` & `utils/crisisCanvas.js`：影拓豐碑通關陣容與評級圖卡渲染。
4. **自動化測試與驗證層 (Testing & Verification Layer)**：
   - `tests/` 下的自動化無介面測試腳本，執行全量資料欄位解析、全 30 位幹員繪圖模擬、HTML 截圖、影拓豐碑關卡模擬驗證。

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 森空島 API 雙端點資料拉取 | 支援 detail 與 indie-hard 雙端點查詢、有效憑證與參數解析 | M1 | ORIGINAL_REQUEST §R1 |
| 2 | 快照容錯與原子性寫入 | 當傳入 UID 時若綁定清單異常不強制中斷，快照採用臨時檔原子替換 | M1 | Survey Report (Data) |
| 3 | 資產預熱批次下載機制 | 在拉取快照或初次部署時自動預先下載所有頭像與豐碑 CDN 圖片至 dynamic/ | M1, M2 | Survey Report (Assets) |
| 4 | 武器類型單複數對齊 | 補齊 `weapon_type_claymores.png` 或於程式碼增加映射，修復雙手劍圖標 | M2 | Survey Report (Commands) |
| 5 | 枚舉與圖標本地化解耦 | 移除 `operatorEnums.js` 外部 Gist 連線，改讀本地圖片轉 Base64 | M2 | Survey Report (Assets) |
| 6 | 防禦性空值保護 | 修復 `charRender.js` 對未裝備武器、深層屬性的讀取，避免 TypeError 崩潰 | M3 | Survey Report (Commands) |
| 7 | 動態字型適配 (Auto-fit Text) | 實作 `drawFitText`，解決 Administrator 等長人名與長裝備名稱文字重疊覆蓋 | M3 | Survey Report (Commands) |
| 8 | 剔除寫死萊萬汀資料 | 移除天賦缺省寫死火系名詞與硬編碼標籤，採用通用空值 fallback | M3 | Survey Report (Commands) |
| 9 | 幹員下拉選單 30 人支援 | 解除 `char.js` 中 `slice(0, 25)` 限制，支援分頁或完整選擇 | M3 | Survey Report (Commands) |
| 10 | 影拓豐碑關卡動態渲染 | 優化 `monument.js` 與 `crisisCanvas.js` 關卡行數動態自適應 | M3 | Survey Report (Commands) |
| 11 | 全鏈路客觀程式化驗證 | 撰寫測試腳本，模擬 30 位幹員與 7 區豐碑之全量欄位解析與繪圖無拋錯測試 | M4 | ORIGINAL_REQUEST §R4 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 資料擷取與快照更新 (Data Snapshot) | 優化 `scripts/fetch_snapshot.js` 支援容錯與原子寫入，確保快照結構完備與 API 拉取正常 | none | DONE |
| M2 | 資產同步與本地解耦 (Assets & Cache) | 預熱快取 30 位幹員頭像與豐碑圖片，對齊雙手劍圖標，解耦 Gist 外部依賴 | M1 | DONE |
| M3 | 指令解析與渲染邏輯適配 (Command Adaptation) | 修復 `charRender.js` 空值防護、動態字型防重疊、移除硬編碼，擴展 `char.js` 與 `monument.js` | M2 | IN_PROGRESS |
| M4 | 客觀程式化 E2E 驗證與對抗審查 (Verification & Hardening) | 執行全覆蓋自動化驗證腳本、Reviewer 程式碼審查、Challenger 對抗測試、Auditor 完整性審計 | M3 | PLANNED |

---

## Interface Contracts
### `scripts/fetch_snapshot.js` ↔ `data/*.json`
- 輸入：`--cred <string>`, `--uid <string>`, `--server <string>`, `--save`, `--warmup-assets`
- 輸出：格式化寫入 `data/data.json` 與 `data/indie-hard.json`。
- 失敗處理：若凭證失效或網路異常，給出清晰中文錯誤提示並維持現有快照不被損毀。

### `utils/operatorEnums.js` ↔ `utils/operatorsHtml.js`
- 介面：`getProfessionIcons()` 必須同步或異步回傳包含 6 種職業 Base64 Data URI 的 Object：
  `{ caster: 'data:image/png;base64,...', guard: '...', ... }`
- 規範：不可依賴外部網路連線，直接讀取 `assets/images/character/profession_*.png`。

### `utils/charRender.js` ↔ 渲染呼叫端
- 介面：`renderCharacter(charData, lang = 'zh_Hant')`
- 回傳：`Promise<Buffer>` (PNG 圖片 Buffer)。
- 防禦合約：即使 `charData.weapon` 為 null，或裝備名長達 20 字元，繪圖流程絕對不可拋出例外，且文字不得覆蓋相鄰圖層。

---

## Code Layout
```
d:\project\endfield-assistant\
├── assets/
│   ├── font/                    # Noto Sans 向量字型
│   └── images/
│       ├── character/           # 屬性、職業、突破、潛能圖標
│       ├── dynamic/             # CDN 快取圖片 (PNG)
│       ├── weapon/              # 武器類型圖標 (含 claymore / claymores)
│       └── ...
├── commands/game/
│   ├── char.js                  # /char 指令與幹員選擇邏輯
│   ├── monument.js              # /monument 指令與豐碑解析
│   └── operators.js             # /operators 指令與列表展示
├── data/
│   ├── data.json                # 角色與幹員全量快照 (30 位幹員)
│   └── indie-hard.json          # 影拓豐碑全量快照 (7 區 29 關)
├── scripts/
│   └── fetch_snapshot.js        # 資料擷取與快照寫入 CLI 腳本
├── utils/
│   ├── charRender.js            # Canvas 幹員卡片繪圖引擎
│   ├── crisisCanvas.js          # 豐碑 Canvas 繪圖引擎
│   ├── operatorEnums.js         # 職業與屬性枚舉
│   └── operatorsHtml.js         # HTML 幹員清單渲染
└── tests/
    └── verify_data_render.js    # 全量無介面自動化驗證腳本
```
