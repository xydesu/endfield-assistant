# Endfield Assistant

[![加入 Discord](https://img.shields.io/badge/加入%20Discord-Endfield%20Assistant-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1466362435782049817)
[![介紹頁面](https://img.shields.io/badge/介紹頁面-繁中%20%2F%20EN-c8a85a?style=for-the-badge)](https://xydesu.github.io/endfield-assistant/)
[![English README](https://img.shields.io/badge/README-English-blue?style=for-the-badge)](./README.md)

一個用於自動化 [明日方舟：終末地簽到入口](https://game.skport.com/endfield/sign-in) 每日簽到的 Discord 機器人。

> 📖 **[查看介紹頁面（繁體中文 / English）](https://xydesu.github.io/endfield-assistant/)** 以取得完整的功能說明與使用方式。

---

## 功能

- **帳號綁定** – 透過互動式表單安全地將你的 Endfield 憑證連結至你的 Discord 帳號（憑證以 AES-256-CBC 加密儲存）
- **手動簽到** – 使用 `/signin` 立即觸發簽到
- **排程簽到** – 使用 `/schedule` 設定每日自動簽到時間
- **伺服器通知** – 將簽到結果發送至指定的伺服器頻道
- **帳號解除綁定** – 使用 `/unbind` 刪除所有已儲存的資料
- **玩家個人資料** – 使用 `/profile` 查看遊戲內等級、體力、戰鬥通行證進度等資訊
- **探索進度** – 使用 `/explore` 檢視各地區的探索狀態
- **成就展示** – 使用 `/achieve` 顯示你的光榮之路成就卡片
- **幹員列表** – 使用 `/operators` 以生成圖卡形式查看你的完整幹員名單
- **體力通知** – 當體力達到設定門檻時，透過 `/stamina-notify` 在通知頻道收到提醒

---

## 指令列表

| 指令 | 說明 | 權限 |
|---|---|---|
| `/help` | 列出所有可用指令 | 所有人 |
| `/invite` | 取得機器人邀請連結 | 所有人 |
| `/bind` | 綁定你的 Endfield 帳號 | 所有人 |
| `/unbind` | 解除綁定並刪除所有已儲存資料 | 所有人 |
| `/signin` | 立即執行簽到 | 所有人 |
| `/schedule [time] [tag]` | 設定每日自動簽到時間（HH:mm） | 所有人 |
| `/profile` | 查看玩家個人資料（等級、體力、BP 等） | 所有人 |
| `/explore` | 查看各地區探索進度 | 所有人 |
| `/achieve` | 查看成就展示（光榮之路） | 所有人 |
| `/operators` | 查看幹員列表 | 所有人 |
| `/stamina-notify <enable> [threshold] [tag]` | 設定體力滿載通知 | 所有人 |
| `/set-notify-channel [channel]` | 設定伺服器通知頻道 | 管理員 |

---

## 加入機器人

若要將已架設好的機器人加入你的伺服器，請使用以下邀請連結——無需自行架設：

**👉 [邀請 Endfield Assistant](https://discord.com/oauth2/authorize?client_id=1466362435782049817)**

---

## 自行架設

### 前置需求

- [Node.js](https://nodejs.org/) v18 或更新版本
- Discord 機器人 Token（[Discord 開發者入口](https://discord.com/developers/applications)）

### 安裝

```bash
# 複製儲存庫
git clone https://github.com/xydesu/endfield-assistant.git
cd endfield-assistant

# 安裝相依套件
npm install
```

### 環境變數

在專案根目錄建立 `.env` 檔案：

```dotenv
# Discord 機器人 Token
DISCORD_TOKEN=your_bot_token_here

# Discord 應用程式 Client ID
CLIENT_ID=your_client_id_here

# （選用）將指令部署至特定伺服器而非全域
GUILD_ID=your_guild_id_here

# 32 位元組的十六進位金鑰，用於 AES-256-CBC 憑證加密
# 產生方式：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_64_character_hex_key_here

# 資料庫引擎（預設：sqlite）
# 支援：sqlite, mysql, mariadb, postgres, mssql, mongodb
DB_DIALECT=sqlite

# 僅 sqlite 使用（可選）
SQLITE_STORAGE=./database/database.sqlite

# mysql/mariadb/postgres/mssql：
# 方式 A：完整連線字串
# DB_URI=postgres://user:password@127.0.0.1:5432/endfield_assistant
# 方式 B：分開設定
# DB_HOST=127.0.0.1
# DB_PORT=5432
# DB_NAME=endfield_assistant
# DB_USER=your_user
# DB_PASSWORD=your_password

# mongodb：
# MONGODB_URI=mongodb://127.0.0.1:27017/endfield_assistant
```

> **安全性提醒：** 請勿將 `.env` 檔案提交至版本控制。請妥善保管你的 `ENCRYPTION_KEY`——若遺失，將無法解密已儲存的憑證。

### 部署斜線指令

```bash
npm run deploy
```

若設定了 `GUILD_ID`，指令將立即註冊至該伺服器。若未設定 `GUILD_ID`，則會全域部署（最長可能需要一小時才能生效）。

### 啟動機器人

```bash
npm start
```

機器人在首次執行時會同步 SQLite 資料庫，並自動恢復所有已排程的簽到工作。

---

## 綁定帳號流程

1. 在機器人可見的任意頻道輸入 `/bind`。
2. 依照步驟式嵌入訊息，在瀏覽器中開啟簽到網站。
3. 開啟瀏覽器開發者主控台（`F12 → Console`），執行提供的腳本以提取你的 Session 憑證。
4. 將輸出的 JSON 貼入點擊 **輸入 Config** 後彈出的表單。
5. 你的憑證將以 AES-256-CBC 加密後儲存至本地的 SQLite 資料庫。

---

## 專案結構

```
endfield-assistant/
├── commands/
│   ├── attendance/        # bind, unbind, signin, schedule
│   ├── game/              # profile, explore, achieve, stamina-notify
│   ├── general/           # help
│   └── utility/           # invite, set-notify-channel
├── database/
│   └── db.js              # Sequelize / SQLite 連線
├── events/
│   ├── interactionCreate.js
│   └── ready.js
├── handlers/
│   ├── commandHandler.js  # 自動載入 /commands 下的指令
│   └── eventHandler.js    # 自動載入 /events 下的事件
├── models/
│   ├── User.js            # 已綁定的使用者資料
│   └── Server.js          # 各伺服器的通知頻道設定
├── utils/
│   ├── achieveHtml.js     # 成就卡片的 HTML 模板渲染
│   ├── attendance.js      # HTTP 簽到邏輯
│   ├── constants.js       # 共用常數
│   ├── encryption.js      # AES-256-CBC 加密 / 解密
│   ├── operatorEnums.js   # 幹員稀有度 / 武器類型列舉
│   ├── operatorsHtml.js   # 幹員名單的 HTML 模板渲染
│   └── scheduler.js       # node-schedule 每日工作管理
├── deploy-commands.js     # 透過 REST 註冊斜線指令
└── index.js               # 機器人進入點
```

---

## 相依套件

| 套件 | 用途 |
|---|---|
| `discord.js` | Discord API 客戶端 |
| `dotenv` | 環境變數載入 |
| `node-schedule` | 類 Cron 工作排程器 |
| `puppeteer` | 無頭瀏覽器，用於圖卡生成 |
| `sequelize` | 資料庫存取 ORM |
| `sqlite3` | SQLite 資料庫驅動程式 |
| `upng-js` | PNG 圖片處理 |

---

## 授權條款

MIT
