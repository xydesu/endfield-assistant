const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const scheduler = require('../../utils/scheduler');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unbind')
        .setDescription('解除綁定並刪除資料 / Unbind and delete data'),
    async execute(interaction) {
        const discordId = interaction.user.id;

        let lang = 'zh_tw';
        try {
            const user = await User.findByPk(discordId);
            lang = user?.language || 'zh_tw';

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_bare'))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            scheduler.cancelUser(discordId);
            await user.destroy();

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'unbind_success_title'))
                .setDescription(t(lang, 'unbind_success_desc'))
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'unbind_fail_title'))
                .setDescription(t(lang, 'unbind_fail_desc'))
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
