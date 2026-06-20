const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const User = require('../../models/User');
const { getCardDetail, getCrisisSummary, getCrisisDetail } = require('../../utils/attendance');
const { drawCrisisUI } = require('../../utils/crisisCanvas');
const { t } = require('../../utils/i18n');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crisis')
        .setDescription('查詢重燃測試危機合約紀錄 / Query Crisis Contract record')
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),

    async execute(interaction) {
        await interaction.deferReply();

        let lang = 'zh_Hant';
        try {
            const user = await User.findOne({ where: { discordId: interaction.user.id } });
            if (user) {
                lang = user.language || 'zh_Hant';
                if (user.serverId === '1' || user.serverId === '57') {
                    lang = 'zh_Hans';
                }
            }

            if (!user || !user.cred || !user.uid) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_desc'));
                return interaction.editReply({ embeds: [embed] });
            }

            const { cred, uid, serverId } = user;

            // 1. Fetch Card Detail to get current Crisis Contract ID
            const detailResultData = await getCardDetail(user);
            if (!detailResultData.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
                    .setDescription(detailResultData.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const crisisList = detailResultData.detail?.crisisContract;
            if (!crisisList || !Array.isArray(crisisList) || crisisList.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'crisis_no_activity_title'))
                    .setDescription(t(lang, 'crisis_no_activity_desc'));
                return interaction.editReply({ embeds: [embed] });
            }

            const currentContractId = crisisList[0].id;
            const currentContractName = crisisList[0].name || '危機合約';

            // 2. Fetch Summary to get recordId
            const summaryResult = await getCrisisSummary(user, currentContractId);

            if (!summaryResult.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
                    .setDescription(summaryResult.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const bestRecord = summaryResult.data?.crisisContract?.history?.bestRecord;
            if (!bestRecord || !bestRecord.id) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'crisis_no_record_title'))
                    .setDescription(t(lang, 'crisis_no_record_desc'));
                return interaction.editReply({ embeds: [embed] });
            }

            const recordId = bestRecord.id;

            // 3. Fetch Detail
            const detailResult = await getCrisisDetail(user, recordId, currentContractId);

            if (!detailResult.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
                    .setDescription(detailResult.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // 4. Generate Image
            const buffer = await drawCrisisUI(summaryResult, detailResult, uid, serverId, currentContractName, lang);
            const attachment = new AttachmentBuilder(buffer, { name: `crisis_${uid}.png` });

            // 5. Send Reply
            const embedTitleFn = t(lang, 'crisis_embed_title');
            const embedTitle = typeof embedTitleFn === 'function' ? embedTitleFn(currentContractName) : `${currentContractName} 作戰紀錄`;
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(embedTitle)
                .setImage(`attachment://crisis_${uid}.png`);

            await interaction.editReply({ embeds: [embed], files: [attachment] });

        } catch (error) {
            console.error('[Crisis Command Error]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'error_title'))
                .setDescription(error.message || t(lang, 'error_query'));
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
