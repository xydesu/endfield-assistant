const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('取得機器人邀請連結')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const clientId = interaction.client.user.id;
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands`;

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('🔗 邀請機器人')
            .setDescription(`點擊下方連結將機器人加入你的伺服器或安裝為個人應用程式！\n\n[➕ 點我邀請](${inviteUrl})`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
