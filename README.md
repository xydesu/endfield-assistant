# Endfield Assistant

[![Add to Discord](https://img.shields.io/badge/Add%20to%20Discord-Endfield%20Assistant-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1466362435782049817)
[![Introduction Page](https://img.shields.io/badge/Introduction%20Page-繁中%20%2F%20EN-c8a85a?style=for-the-badge)](https://xydesu.github.io/endfield-assistant/)

A Discord bot for automating daily sign-ins on the [Arknights: Endfield sign-in portal](https://game.skport.com/endfield/sign-in).

> 📖 **[View the introduction page (繁體中文 / English)](https://xydesu.github.io/endfield-assistant/)** for a full overview of features and usage.

---

## Features

- **Account binding** – securely link your Endfield credentials to your Discord account via an interactive modal (credentials are encrypted at rest using AES-256-CBC)
- **Manual sign-in** – trigger a sign-in on demand with `/signin`
- **Scheduled sign-in** – configure a daily auto sign-in time with `/schedule`
- **Guild notifications** – post sign-in results to a designated server channel
- **Account unbinding** – remove all stored data with `/unbind`

---

## Commands

| Command | Description | Permission |
|---|---|---|
| `/help` | List all available commands | Everyone |
| `/ping` | Check bot latency | Everyone |
| `/bind` | Bind your Endfield account | Everyone |
| `/unbind` | Remove your binding and all stored data | Everyone |
| `/signin` | Perform an immediate sign-in | Everyone |
| `/schedule [time] [tag]` | Set a daily auto sign-in time (HH:mm) | Everyone |
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

The bot will sync the SQLite database on first run and restore all scheduled sign-in jobs automatically.

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
│   ├── general/           # help
│   └── utility/           # ping, set-notify-channel
├── database/
│   └── db.js              # Sequelize / SQLite connection
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
│   ├── attendance.js      # HTTP sign-in logic
│   ├── constants.js       # Shared constants
│   ├── encryption.js      # AES-256-CBC encrypt / decrypt
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
| `sequelize` | ORM for database access |
| `sqlite3` | SQLite database driver |

---

## License

ISC
