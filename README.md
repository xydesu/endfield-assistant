# Endfield Assistant

[![Add to Discord](https://img.shields.io/badge/Add%20to%20Discord-Endfield%20Assistant-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1466362435782049817)
[![Introduction Page](https://img.shields.io/badge/Introduction%20Page-繁中%20%2F%20EN-c8a85a?style=for-the-badge)](https://xydesu.github.io/endfield-assistant/)
[![繁體中文 README](https://img.shields.io/badge/README-繁體中文-red?style=for-the-badge)](./README.zh-TW.md)

A Discord bot for automating daily sign-ins on the [Arknights: Endfield sign-in portal](https://game.skport.com/endfield/sign-in).

> 📖 **[View the introduction page (繁體中文 / English)](https://xydesu.github.io/endfield-assistant/)** for a full overview of features and usage.

---

## Features

- **Account binding** – securely link your Endfield credentials to your Discord account via an interactive modal (credentials are encrypted at rest using AES-256-CBC)
- **Manual sign-in** – trigger a sign-in on demand with `/signin`
- **Scheduled sign-in** – configure a daily auto sign-in time with `/schedule`
- **Guild notifications** – post sign-in results to a designated server channel
- **Account unbinding** – remove all stored data with `/unbind`
- **Player profile** – view your in-game level, stamina, battle pass progress, and more with `/profile`
- **Exploration progress** – check per-region exploration status with `/explore`
- **Achievement showcase** – display your 光榮之路 achievement card with `/achieve`
- **Operator list** – view your full operator roster as a generated image card with `/operators`
- **Stamina notifications** – receive an alert in the notify channel when stamina reaches a set threshold with `/stamina-notify`

---

## Commands

| Command | Description | Permission |
|---|---|---|
| `/help` | List all available commands | Everyone |
| `/invite` | Get the bot invite link | Everyone |
| `/bind` | Bind your Endfield account | Everyone |
| `/unbind` | Remove your binding and all stored data | Everyone |
| `/signin` | Perform an immediate sign-in | Everyone |
| `/schedule [time] [tag]` | Set a daily auto sign-in time (HH:mm) | Everyone |
| `/profile` | View player profile (level, stamina, BP, etc.) | Everyone |
| `/explore` | View per-area exploration progress | Everyone |
| `/achieve` | View achievement showcase (光榮之路) | Everyone |
| `/operators` | View your operator roster | Everyone |
| `/stamina-notify <enable> [threshold] [tag]` | Configure stamina-full notification | Everyone |
| `/set-notify-channel [channel]` | Set the guild notification channel | Administrator |

---

## Add the Bot

To add the hosted bot to your server, use the invite link below — no self-hosting required:

**👉 [Invite Endfield Assistant](https://discord.com/oauth2/authorize?client_id=1466362435782049817)**

---

## Self-Hosting Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- A Discord bot token ([Discord Developer Portal](https://discord.com/developers/applications))

### Installation

```bash
# Clone the repository
git clone https://github.com/xydesu/endfield-assistant.git
cd endfield-assistant

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```dotenv
# Discord bot token
DISCORD_TOKEN=your_bot_token_here

# Discord application client ID
CLIENT_ID=your_client_id_here

# (Optional) Deploy commands to a specific guild instead of globally
GUILD_ID=your_guild_id_here

# 32-byte hex key for AES-256-CBC credential encryption
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_64_character_hex_key_here

# Database engine (default: sqlite)
# Supported: sqlite, mysql, mariadb, postgres, mssql, mongodb
DB_DIALECT=sqlite

# For sqlite only (optional)
SQLITE_STORAGE=./database/database.sqlite

# For mysql/mariadb/postgres/mssql:
# Option A: full URI
# DB_URI=postgres://user:password@127.0.0.1:5432/endfield_assistant
# Option B: split fields
# DB_HOST=127.0.0.1
# DB_PORT=5432
# DB_NAME=endfield_assistant
# DB_USER=your_user
# DB_PASSWORD=your_password

# For mongodb:
# MONGODB_URI=mongodb://127.0.0.1:27017/endfield_assistant
```

> **Security note:** Never commit your `.env` file. Keep your `ENCRYPTION_KEY` secret and back it up — losing it will prevent existing credentials from being decrypted.

### Deploy Slash Commands

```bash
npm run deploy
```

If `GUILD_ID` is set, the commands are registered to that guild (instant). Without `GUILD_ID`, they are registered globally (may take up to one hour to propagate).

### Start the Bot

```bash
npm start
```

The bot will initialize the configured database on first run and restore all scheduled sign-in jobs automatically.

---

## How Binding Works

1. Run `/bind` in any channel the bot can see.
2. Follow the step-by-step embed to open the sign-in website in a browser.
3. Open the browser developer console (`F12 → Console`) and run the provided script to extract your session credentials.
4. Paste the resulting JSON into the modal that opens when you click **輸入 Config**.
5. Your credentials are encrypted with AES-256-CBC before being stored in the local SQLite database.

---

## Project Structure

```
endfield-assistant/
├── commands/
│   ├── attendance/        # bind, unbind, signin, schedule
│   ├── game/              # profile, explore, achieve, stamina-notify
│   ├── general/           # help
│   └── utility/           # invite, set-notify-channel
├── database/
│   └── db.js              # Database connector (SQLite default, MySQL/Postgres/MongoDB optional)
├── events/
│   ├── interactionCreate.js
│   └── ready.js
├── handlers/
│   ├── commandHandler.js  # Auto-loads commands from /commands
│   └── eventHandler.js    # Auto-loads events from /events
├── models/
│   ├── User.js            # Bound user data
│   └── Server.js          # Per-guild notification channel
├── utils/
│   ├── achieveHtml.js     # HTML template for achievement card rendering
│   ├── attendance.js      # HTTP sign-in logic
│   ├── constants.js       # Shared constants
│   ├── encryption.js      # AES-256-CBC encrypt / decrypt
│   ├── operatorEnums.js   # Operator rarity / weapon-type enums
│   ├── operatorsHtml.js   # HTML template for operator roster rendering
│   └── scheduler.js       # node-schedule daily job manager
├── deploy-commands.js     # Registers slash commands via REST
└── index.js               # Bot entry point
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `discord.js` | Discord API client |
| `dotenv` | Environment variable loading |
| `node-schedule` | Cron-like job scheduler |
| `puppeteer` | Headless browser for image card generation |
| `sequelize` | ORM for database access |
| `mongoose` | MongoDB ODM |
| `mysql2` | MySQL/MariaDB driver for Sequelize |
| `pg` / `pg-hstore` | PostgreSQL driver for Sequelize |
| `sqlite3` | SQLite database driver |
| `tedious` | MSSQL driver for Sequelize |
| `upng-js` | PNG image processing |

---

## License

MIT
