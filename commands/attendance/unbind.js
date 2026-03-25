const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const scheduler = require('../../utils/scheduler');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unbind')
        .setDescription('解除綁定並刪除資料'),
    async execute(interaction) {
        const discordId = interaction.user.id;

        try {
            const user = await User.findByPk(discordId);
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 尚未綁定')
                    .setDescription('尚未綁定帳號。')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            scheduler.cancelUser(discordId);
            await user.destroy();

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('✅ 解除成功')
                .setDescription('已解除綁定並刪除您的資料。')
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('❌ 解除失敗')
                .setDescription('資料庫發生錯誤。')
                .setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
};
