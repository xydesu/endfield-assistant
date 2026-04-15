const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stamina-notify')
        .setDescription('設定理智快滿提醒 / Set stamina reminder')
        .addBooleanOption(option =>
            option.setName('enable')
                .setDescription('是否開啟理智快滿提醒 / Enable stamina reminder')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('threshold')
                .setDescription('提醒閾值 (1–99, 預設 80) / Threshold % (1–99, default 80)')
                .setMinValue(1)
                .setMaxValue(99)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('tag')
                .setDescription('是否在通知中提及您 / Mention you in notifications')
                .setRequired(false)),
    async execute(interaction) {
        const enable = interaction.options.getBoolean('enable');
        const threshold = interaction.options.getInteger('threshold') ?? 80;
        const isStaminaTag = interaction.options.getBoolean('tag') ?? true;
        const discordId = interaction.user.id;

        try {
            const user = await User.findByPk(discordId);
            const lang = user?.language || 'zh_tw';

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_short'))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            await user.update({
                staminaNotify: enable,
                staminaThreshold: threshold,
                isStaminaTag: isStaminaTag,
                // Reset the notified flag so the next check can fire immediately if applicable
                staminaNotified: false,
            });

            const description = enable
                ? t(lang, 'stamina_enabled')(threshold, isStaminaTag)
                : t(lang, 'stamina_disabled');

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'stamina_title'))
                .setDescription(description)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t('zh_tw', 'stamina_fail_title'))
                .setDescription(t('zh_tw', 'db_error'))
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
