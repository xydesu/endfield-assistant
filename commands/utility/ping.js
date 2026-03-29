const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('回覆 Pong! (延遲測試)')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('🏓 Pong!')
            .setDescription(`延遲: ${Date.now() - interaction.createdTimestamp}ms`)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    },
};
