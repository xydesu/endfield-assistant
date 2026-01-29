const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { signIn } = require('../../utils/attendance');

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
                .setColor('#e74c3c')
                .setTitle('❌ 尚未綁定')
                .setDescription('您尚未綁定帳號，請先使用 `/bind` 指令進行綁定。')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        const result = await signIn(user);

        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ 簽到成功')
                .setDescription(result.message)
                .setTimestamp();

            if (result.data && result.data !== '無') {
                embed.addFields({ name: '🎁 獲得獎勵', value: `\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``, inline: false });
            }

            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ 簽到失敗')
                .setDescription(result.message)
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
