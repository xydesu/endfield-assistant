const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const User = require('../../models/User');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('取得機器人邀請連結 / Get bot invite link')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const user = await User.findByPk(interaction.user.id);
        const lang = user?.language || 'zh_tw';

        const clientId = interaction.client.user.id;
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands`;

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(t(lang, 'invite_title'))
            .setDescription(t(lang, 'invite_desc')(inviteUrl))
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
};
