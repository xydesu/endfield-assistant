const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const User = require('../../models/User');
const { EMBED_COLOR } = require('../../utils/constants');
const { t, SUPPORTED_LANGUAGES, LANGUAGE_LABELS } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Set bot language / 設定機器人語言')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addStringOption(option =>
            option.setName('lang')
                .setDescription('Language / 語言')
                .setRequired(true)
                .addChoices(
                    ...SUPPORTED_LANGUAGES.map(lang => ({
                        name: LANGUAGE_LABELS[lang],
                        value: lang,
                    }))
                )),
    async execute(interaction) {
        const lang = interaction.options.getString('lang');
        const discordId = interaction.user.id;

        try {
            const user = await User.findByPk(discordId);
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'language_not_bound'))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            await user.update({ language: lang });

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'language_set_title'))
                .setDescription(t(lang, 'language_set_desc')(LANGUAGE_LABELS[lang]))
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'language_fail_title'))
                .setDescription(t(lang, 'db_error'))
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
