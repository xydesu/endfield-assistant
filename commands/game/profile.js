const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('查詢玩家個人資料 (等級、理智、BP 等)'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
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

            const result = await getCardDetail(user);

            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 查詢失敗')
                    .setDescription(result.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const { base, bpSystem, dungeon, dailyMission, weeklyMission, achieve } = result.detail;

            // Stamina time-to-full calculation
            const curStamina = parseInt(dungeon.curStamina);
            const maxStamina = parseInt(dungeon.maxStamina);
            const fullRecoveryTs = parseInt(dungeon.maxTs);
            let staminaText = `${curStamina} / ${maxStamina}`;
            if (curStamina < maxStamina) {
                const secondsLeft = fullRecoveryTs - Math.floor(Date.now() / 1000);
                if (secondsLeft > 0) {
                    const h = Math.floor(secondsLeft / 3600);
                    const m = Math.floor((secondsLeft % 3600) / 60);
                    staminaText += `\n回滿：${h > 0 ? `${h} 小時 ` : ''}${m} 分鐘後`;
                } else {
                    staminaText += '\n（已回滿）';
                }
            } else {
                staminaText += '\n（已滿）';
            }

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(`👤 ${base.name} 的玩家資料`)
                .setThumbnail(base.avatarUrl ?? null)
                .addFields(
                    { name: '🌐 伺服器', value: base.serverName ?? '—', inline: true },
                    { name: '📊 權限等階', value: `Lv. ${base.level}`, inline: true },
                    { name: '🌍 探索等級', value: `${base.worldLevel}`, inline: true },
                    { name: '👥 幹員', value: `${base.charNum}`, inline: true },
                    { name: '⚔️ 武器', value: `${base.weaponNum}`, inline: true },
                    { name: '📖 檔案', value: `${base.docNum}`, inline: true },
                    { name: '🔋 理智', value: staminaText, inline: false },
                    { name: '🏆 通行證', value: `Lv. ${bpSystem.curLevel} / ${bpSystem.maxLevel}`, inline: true },
                    { name: '📋 活躍度', value: dailyMission ? `${dailyMission.dailyActivation} / ${dailyMission.maxDailyActivation}` : '—', inline: true },
                    { name: '📋 每周事務', value: `${weeklyMission.score} / ${weeklyMission.total}`, inline: true },
                    { name: '🏅 光榮之路', value: achieve ? `${achieve.count}` : '—', inline: true },
                )
                .setFooter({ text: `主線進度：${base.mainMission?.description ?? '—'}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[profile]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('❌ 發生錯誤')
                .setDescription('查詢時發生錯誤，請稍後再試。')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
