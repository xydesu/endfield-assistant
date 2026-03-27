const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('列出所有指令'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('📜 使用說明')
            .setDescription('以下是目前可用的指令列表：')
            .addFields(
                { name: '🔧 一般指令', value: '`/help` - 顯示本說明\n`/ping` - 測試機器人延遲' },
                { name: '📅 簽到指令', value: '`/bind` - 綁定 Endfield 帳號\n`/unbind` - 解除綁定\n`/signin` - 立即執行一次簽到\n`/schedule` - 設定每日自動簽到時間' },
                { name: '🎮 遊戲資訊', value: '`/profile` - 查詢玩家個人資料 (等級、理智、BP 等)\n`/explore` - 查詢各區域探索進度 (寶箱、謎題、暗箱等)\n`/stamina-notify` - 設定理智快滿提醒' },
                { name: '⚙️ 管理指令', value: '`/set-notify-channel` - 設定伺服器通知頻道 (限管理員)' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
