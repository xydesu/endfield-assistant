const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { signIn, buildAttendanceEmbed } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('signin')
        .setDescription('立即執行一次簽到 / Sign in manually'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const discordId = interaction.user.id;
        const user = await User.findByPk(discordId);
        const lang = user?.language || 'zh_tw';

        if (!user) {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'not_bound_title'))
                .setDescription(t(lang, 'not_bound_desc'))
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        const result = await signIn(user);

        if (result.success) {
            const embed = buildAttendanceEmbed(EmbedBuilder, EMBED_COLOR, t(lang, 'signin_success'), result, interaction.user, lang);
            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'signin_fail_title'))
                .setDescription(result.message)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
