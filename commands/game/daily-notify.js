const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');
const { scheduleDailyNotifyUser, cancelDailyNotifyUser } = require('../../utils/scheduler');

// UTC offset (hours) for each server ID
const SERVER_UTC_OFFSETS = { '2': 8, '3': -5 };
const SERVER_TIMEZONE_LABELS = { '2': 'UTC+8', '3': 'UTC-5' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily-notify')
        .setDescription('設定每日任務未完成提醒 (需先設定通知頻道)')
        .addBooleanOption(option =>
            option.setName('enable')
                .setDescription('是否開啟每日任務未完成提醒')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('hour')
                .setDescription('提醒時間 (小時，伺服器時間，0–23)')
                .setMinValue(0)
                .setMaxValue(23)
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('minute')
                .setDescription('提醒時間 (分鐘，0–59，預設 0)')
                .setMinValue(0)
                .setMaxValue(59)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('tag')
                .setDescription('是否在每日任務提醒通知中提及 (Tag) 您')
                .setRequired(false)),
    async execute(interaction) {
        const enable = interaction.options.getBoolean('enable');
        const hourInput = interaction.options.getInteger('hour');
        const minuteInput = interaction.options.getInteger('minute') ?? 0;
        const isDailyTag = interaction.options.getBoolean('tag') ?? true;
        const discordId = interaction.user.id;

        let lang = 'zh_tw';
        try {
            const user = await User.findByPk(discordId);
            lang = user?.language || 'zh_tw';

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_short'))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            if (enable) {
                if (hourInput === null) {
                    const embed = new EmbedBuilder()
                        .setColor(EMBED_COLOR)
                        .setTitle(t(lang, 'daily_notify_missing_hour_title'))
                        .setDescription(t(lang, 'daily_notify_missing_hour_desc'))
                        .setTimestamp();
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }

                const offset = SERVER_UTC_OFFSETS[user.serverId] ?? 0;
                const utcHour = ((hourInput - offset) % 24 + 24) % 24;
                const dailyNotifyTime = `${String(utcHour).padStart(2, '0')}:${String(minuteInput).padStart(2, '0')}`;
                const tzLabel = SERVER_TIMEZONE_LABELS[user.serverId] ?? 'UTC';

                await user.update({
                    dailyNotify: true,
                    dailyNotifyTime,
                    isDailyTag,
                    dailyNotified: false,
                });

                // Schedule (or reschedule) the notification job for this user
                const client = interaction.client;
                scheduleDailyNotifyUser(user, client);

                const timeDisplay = `${String(hourInput).padStart(2, '0')}:${String(minuteInput).padStart(2, '0')} (${tzLabel})`;
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'daily_notify_title'))
                    .setDescription(t(lang, 'daily_notify_enabled_desc')(timeDisplay, isDailyTag))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                await user.update({
                    dailyNotify: false,
                    dailyNotified: false,
                });

                cancelDailyNotifyUser(discordId);

                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'daily_notify_title'))
                    .setDescription(t(lang, 'daily_notify_disabled_desc'))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'daily_notify_fail_title'))
                .setDescription(t(lang, 'db_error'))
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};

