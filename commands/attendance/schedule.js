const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const scheduler = require('../../utils/scheduler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('設定每日自動簽到時間')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('時間 (格式 HH:mm, 例如 09:00)')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('tag')
                .setDescription('是否在通知中提及 (Tag) 您')
                .setRequired(false)),
    async execute(interaction) {
        const time = interaction.options.getString('time');
        const isTag = interaction.options.getBoolean('tag') ?? true; // Default to true if not provided
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

        if (!timeRegex.test(time)) {
            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ 格式錯誤')
                .setDescription('時間格式錯誤，請使用 HH:mm (例如 09:00 或 23:30)。')
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const discordId = interaction.user.id;
        const guildId = interaction.guild ? interaction.guild.id : null;

        try {
            const user = await User.findByPk(discordId);
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('❌ 尚未綁定')
                    .setDescription('尚未綁定帳號，請先使用 `/bind`。')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            await user.update({
                autoSignTime: time,
                isTag: isTag,
                notifyGuildId: guildId
            });
            scheduler.scheduleUser(user, interaction.client);

            let replyMsg = `✅ 已設定每日自動簽到時間為：${time}`;
            if (guildId) {
                replyMsg += `\n📍 通知將發送至本伺服器 (若伺服器已設定通知頻道)。`;
            } else {
                replyMsg += `\n⚠️ 注意：您是在私訊中使用指令，機器人可能無法正確發送通知到伺服器。建議在伺服器中使用此指令。`;
            }
            replyMsg += `\n🔔 通知提及 (Tag): ${isTag ? '開啟' : '關閉'}`;

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ 設定成功')
                .setDescription(replyMsg)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ 設定失敗')
                .setDescription('資料庫發生錯誤或排程失敗。')
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
