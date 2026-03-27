const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stamina-notify')
        .setDescription('設定體力快滿提醒 (需先設定通知頻道)')
        .addBooleanOption(option =>
            option.setName('enable')
                .setDescription('是否開啟體力快滿提醒')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('threshold')
                .setDescription('提醒閾值：體力達到最大值的百分比時提醒 (1–99，預設 80)')
                .setMinValue(1)
                .setMaxValue(99)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('tag')
                .setDescription('是否在體力提醒通知中提及 (Tag) 您')
                .setRequired(false)),
    async execute(interaction) {
        const enable = interaction.options.getBoolean('enable');
        const threshold = interaction.options.getInteger('threshold') ?? 80;
        const isStaminaTag = interaction.options.getBoolean('tag') ?? true;
        const discordId = interaction.user.id;

        try {
            const user = await User.findByPk(discordId);
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 尚未綁定')
                    .setDescription('尚未綁定帳號，請先使用 `/bind`。')
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
                ? `✅ 已開啟體力提醒。\n當體力達到最大值的 **${threshold}%** 時，將於通知頻道發送提醒。\n🔔 通知提及 (Tag): ${isStaminaTag ? '開啟' : '關閉'}\n\n⚠️ 前置需求：\n• 請先使用 \`/set-notify-channel\` 設定伺服器通知頻道。\n• 請先使用 \`/schedule\` 設定自動簽到，以確保通知範圍正確。`
                : '🔕 已關閉體力提醒。';

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('🔋 體力提醒設定')
                .setDescription(description)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('❌ 設定失敗')
                .setDescription('資料庫發生錯誤，請稍後再試。')
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
