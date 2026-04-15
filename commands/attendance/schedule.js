const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const scheduler = require('../../utils/scheduler');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('設定每日自動簽到時間 / Set daily auto sign-in time')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('時間 (格式 HH:mm, 例如 09:00) / Time (HH:mm)')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('tag')
                .setDescription('是否在通知中提及您 / Mention you in notifications')
                .setRequired(false)),
    async execute(interaction) {
        const time = interaction.options.getString('time');
        const isTag = interaction.options.getBoolean('tag') ?? true; // Default to true if not provided
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

        const discordId = interaction.user.id;
        const user = await User.findByPk(discordId);
        const lang = user?.language || 'zh_tw';

        if (!timeRegex.test(time)) {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'schedule_format_title'))
                .setDescription(t(lang, 'schedule_format_desc'))
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const guildId = interaction.guild ? interaction.guild.id : null;

        try {
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_short'))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            await user.update({
                autoSignTime: time,
                isTag: isTag,
                notifyGuildId: guildId
            });
            scheduler.scheduleUser(user, interaction.client);

            let replyMsg = t(lang, 'schedule_success_msg')(time);
            if (guildId) {
                replyMsg += t(lang, 'schedule_guild_note');
            } else {
                replyMsg += t(lang, 'schedule_dm_note');
            }
            replyMsg += t(lang, 'schedule_tag_note')(isTag);

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'schedule_success_title'))
                .setDescription(replyMsg)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'schedule_fail_title'))
                .setDescription(t(lang, 'schedule_fail_desc'))
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
