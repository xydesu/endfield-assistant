const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const Server = require('../../models/Server');
const User = require('../../models/User');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-notify-channel')
        .setDescription('設定自動簽到通知頻道 / Set notification channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('選擇通知頻道 / Select notification channel')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const user = await User.findByPk(interaction.user.id);
        const lang = user?.language || 'zh_tw';
        const channel = interaction.options.getChannel('channel');

        try {
            await Server.upsert({
                guildId: interaction.guild.id,
                notifyChannelId: channel.id
            });

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'notify_success_title'))
                .setDescription(t(lang, 'notify_success_desc')(channel))
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error(error);
            const errorEmbed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'notify_fail_title'))
                .setDescription(t(lang, 'db_error'))
                .setTimestamp();
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    },
};
