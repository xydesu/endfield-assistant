const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('explore')
        .setDescription('查詢各區域探索進度 (寶箱、謎題、暗箱等)'),
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

        const result = await getCardDetail(user);

        if (!result.success) {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('❌ 查詢失敗')
                .setDescription(result.message)
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        const domains = result.detail.domain ?? [];

        if (domains.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('🗺️ 探索進度')
                .setDescription('目前無探索資料。')
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
                if (treasureChest.total > 0) parts.push(`儲藏箱:${treasureChest.count}/${treasureChest.total}`);
                if (blackbox.total > 0) parts.push(`協議採錄樁:${blackbox.count}/${blackbox.total}`);
                if (puzzle.total > 0) parts.push(`醚質:${puzzle.count}/${puzzle.total}`);
                if (piece.total > 0) parts.push(`維修靈感點:${piece.count}/${piece.total}`);
                if (equipChest.total > 0) parts.push(`裝備模板箱:${equipChest.count}/${equipChest.total}`);
                const summary = parts.length > 0 ? parts.join(' ') : '—';
                return `**${lv.name}**\n${summary}`;
            });

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(`🗺️ ${domain.name}（等級 ${domain.level}）`)
                .setDescription(levelLines.join('\n\n') || '—')
                .setTimestamp();

            const moneyMgr = domain.moneyMgr;
            if (moneyMgr) {
                embed.addFields({
                    name: '💰 結算站資金',
                    value: `${parseInt(moneyMgr.count).toLocaleString()} / ${parseInt(moneyMgr.total).toLocaleString()}`,
                    inline: false,
                });
            }

            return embed;
        });

        // Discord allows up to 10 embeds per message
        await interaction.editReply({ embeds: embeds.slice(0, 10) });
    },
};
