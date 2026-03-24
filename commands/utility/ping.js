const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('回覆 Pong! (延遲測試)'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('🏓 Pong!')
            .setDescription(`延遲: ${Date.now() - interaction.createdTimestamp}ms`)
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    },
};
