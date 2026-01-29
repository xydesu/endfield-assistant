const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const Server = require('../../models/Server');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-notify-channel')
        .setDescription('設定自動簽到通知頻道')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('選擇通知頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        try {
            await Server.upsert({
                guildId: interaction.guild.id,
                notifyChannelId: channel.id
            });

            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ 設定成功')
                .setDescription(`已將自動簽到通知頻道設定為 ${channel}。`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ 設定失敗')
                .setDescription('資料庫發生錯誤，請稍後再試。')
                .setTimestamp();
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};
