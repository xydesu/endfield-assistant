const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('列出所有指令')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
            .setTitle('📖 指令列表')
            .setDescription('以下是目前所有可用的指令：')
            .addFields(
                {
                    name: '🔧 一般',
                    value: [
                        '`/help` 顯示本說明',
                        '`/invite` 取得機器人邀請連結',
                    ].join('\n'),
                },
                {
                    name: '📅 簽到',
                    value: [
                        '`/bind` 綁定 Endfield 帳號',
                        '`/unbind` 解除綁定',
                        '`/signin` 立即執行一次簽到',
                        '`/schedule` 設定每日自動簽到時間',
                    ].join('\n'),
                },
                {
                    name: '🎮 遊戲資訊',
                    value: [
                        '`/profile` 查詢玩家個人資料（等級、理智、BP 等）',
                        '`/explore` 查詢各區域探索進度（寶箱、謎題、暗箱等）',
                        '`/stamina-notify` 設定理智快滿提醒',
                    ].join('\n'),
                },
                {
                    name: '⚙️ 管理',
                    value: '`/set-notify-channel` 設定伺服器通知頻道（限管理員）',
                }
            )
            .setFooter({ text: '如有問題請聯絡伺服器管理員' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
