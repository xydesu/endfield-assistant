const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { signIn, buildAttendanceEmbed } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('signin')
        .setDescription('立即執行一次簽到'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const discordId = interaction.user.id;
        const user = await User.findByPk(discordId);

        if (!user) {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('❌ 尚未綁定')
                .setDescription('您尚未綁定帳號，請先使用 `/bind` 指令進行綁定。')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        const result = await signIn(user);

        if (result.success) {
            const embed = buildAttendanceEmbed(EmbedBuilder, EMBED_COLOR, '✅ 簽到成功', result, interaction.user);
            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('❌ 簽到失敗')
                .setDescription(result.message)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
