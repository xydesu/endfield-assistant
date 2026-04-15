const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('查詢玩家個人資料 / View player profile')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        let lang = 'zh_tw';
        try {
            const discordId = interaction.user.id;
            const user = await User.findByPk(discordId);
            lang = user?.language || 'zh_tw';

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_desc'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const result = await getCardDetail(user);

            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
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
                    staminaText += '\n' + t(lang, 'profile_stamina_full_in')(h, m);
                } else {
                    staminaText += '\n' + t(lang, 'profile_stamina_full');
                }
            } else {
                staminaText += '\n' + t(lang, 'profile_stamina_max');
            }

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'profile_title')(base.name))
                .setThumbnail(base.avatarUrl ?? null)
                .addFields(
                    { name: t(lang, 'profile_server'), value: base.serverName ?? '—', inline: true },
                    { name: t(lang, 'profile_level'), value: `Lv. ${base.level}`, inline: true },
                    { name: t(lang, 'profile_world_level'), value: `${base.worldLevel}`, inline: true },
                    { name: t(lang, 'profile_char'), value: `${base.charNum}`, inline: true },
                    { name: t(lang, 'profile_weapon'), value: `${base.weaponNum}`, inline: true },
                    { name: t(lang, 'profile_doc'), value: `${base.docNum}`, inline: true },
                    { name: t(lang, 'profile_stamina'), value: staminaText, inline: false },
                    { name: t(lang, 'profile_bp'), value: `Lv. ${bpSystem.curLevel} / ${bpSystem.maxLevel}`, inline: true },
                    { name: t(lang, 'profile_daily'), value: dailyMission ? `${dailyMission.dailyActivation} / ${dailyMission.maxDailyActivation}` : '—', inline: true },
                    { name: t(lang, 'profile_weekly'), value: `${weeklyMission.score} / ${weeklyMission.total}`, inline: true },
                    { name: t(lang, 'profile_achieve'), value: achieve ? `${achieve.count}` : '—', inline: true },
                )
                .setFooter({ text: t(lang, 'profile_footer')(base.mainMission?.description) })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('[profile]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'error_title'))
                .setDescription(t(lang, 'error_query'))
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
