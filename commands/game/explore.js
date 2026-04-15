const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('explore')
        .setDescription('查詢各區域探索進度 / View exploration progress')
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

            const domains = result.detail.domain ?? [];

            if (domains.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'explore_no_data_title'))
                    .setDescription(t(lang, 'explore_no_data'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // Build one embed per domain
            const embeds = domains.map((domain) => {
                const levels = domain.levels ?? [];
                const levelLines = levels.map((lv) => {
                    const treasureChest = lv.trchestCount;
                    const blackbox = lv.blackboxCount;
                    const puzzle = lv.puzzleCount;
                    const piece = lv.pieceCount;
                    const equipChest = lv.equipTrchestCount;
                    const parts = [];
                    if (treasureChest.total > 0) parts.push(`${t(lang, 'explore_treasure')}:${treasureChest.count}/${treasureChest.total}`);
                    if (blackbox.total > 0) parts.push(`${t(lang, 'explore_blackbox')}:${blackbox.count}/${blackbox.total}`);
                    if (puzzle.total > 0) parts.push(`${t(lang, 'explore_puzzle')}:${puzzle.count}/${puzzle.total}`);
                    if (piece.total > 0) parts.push(`${t(lang, 'explore_piece')}:${piece.count}/${piece.total}`);
                    if (equipChest.total > 0) parts.push(`${t(lang, 'explore_equip')}:${equipChest.count}/${equipChest.total}`);
                    const summary = parts.length > 0 ? parts.join(' ') : '—';
                    return `**${lv.name}**\n${summary}`;
                });

                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'explore_title')(domain.name, domain.level))
                    .setDescription(levelLines.join('\n\n') || '—')
                    .setTimestamp();

                const moneyMgr = domain.moneyMgr;
                if (moneyMgr) {
                    embed.addFields({
                        name: t(lang, 'explore_currency')(domain.name),
                        value: `${parseInt(moneyMgr.count).toLocaleString()} / ${parseInt(moneyMgr.total).toLocaleString()}`,
                        inline: false,
                    });
                }

                return embed;
            });

            // Discord allows up to 10 embeds per message
            await interaction.editReply({ embeds: embeds.slice(0, 10) });
        } catch (error) {
            console.error('[explore]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'error_title'))
                .setDescription(t(lang, 'error_query'))
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
