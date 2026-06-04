const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

// 核心環境變數驗證
if (!process.env.DISCORD_TOKEN) {
    console.error('[Fatal] ❌ 缺少核心環境變數 DISCORD_TOKEN！請確認您的 .env 檔案配置正確。');
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

require('./handlers/commandHandler')(client);
require('./handlers/eventHandler')(client);

client.login(process.env.DISCORD_TOKEN);
