const {
    SlashCommandBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    ApplicationIntegrationType,
    InteractionContextType,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const User = require('../../models/User');
const { getCardDetail, getCrisisSummary, getCrisisDetail } = require('../../utils/attendance');
const { drawCrisisUI } = require('../../utils/crisisCanvas');
const { t } = require('../../utils/i18n');
const { EMBED_COLOR } = require('../../utils/constants');

const VIEW_TTL_MS = 15 * 60 * 1000;
const MAX_SELECT_OPTIONS = 25;
const MAX_CACHED_CRISIS_VIEWS = 500;
const crisisViewState = new Map();

/**
 * 清理過期或超額的危機合約互動狀態，避免記憶體累積
 */
function pruneExpiredStates() {
    const now = Date.now();
    for (const [msgId, state] of crisisViewState.entries()) {
        if (state.expiresAt < now) {
            crisisViewState.delete(msgId);
        }
    }
    while (crisisViewState.size >= MAX_CACHED_CRISIS_VIEWS) {
        const oldestKey = crisisViewState.keys().next().value;
        if (!oldestKey) break;
        crisisViewState.delete(oldestKey);
    }
}

function resolveUserLang(user) {
    let lang = user?.language || 'zh_Hant';
    if (user?.serverId === '1' || user?.serverId === '57') {
        lang = 'zh_Hans';
    }
    return lang;
}

/**
 * 從 card/detail 幹員列表建立 charId -> charData 查表
 */
function buildCharMetaMap(detailChars) {
    const map = new Map();
    if (!Array.isArray(detailChars)) return map;
    for (const item of detailChars) {
        const id = item?.charData?.id;
        if (id) {
            map.set(id, item.charData);
        }
    }
    return map;
}

/**
 * 依開始時間由新到舊排序合約期數（保留無時間戳項目之原順序）
 */
function sortCrisisContracts(list) {
    return [...list].sort((a, b) => {
        const ta = Number(a?.startAtTs || 0);
        const tb = Number(b?.startAtTs || 0);
        return tb - ta;
    });
}

/**
 * 依合約清單與選中索引建構 Embed、圖片附件與期數切換選單
 */
async function buildCrisisPayload(user, crisisList, selectedIndex, charMetaMap, lang, notice = '') {
    const { uid, serverId } = user;
    const clampedIdx = Math.max(0, Math.min(selectedIndex, crisisList.length - 1));
    const contractObj = crisisList[clampedIdx];
    const currentContractId = contractObj.id;
    const currentContractName = contractObj.name || '危機合約';

    const components = [];
    if (crisisList.length > 1) {
        let startIdx = 0;
        if (crisisList.length > MAX_SELECT_OPTIONS && clampedIdx >= MAX_SELECT_OPTIONS) {
            startIdx = Math.min(crisisList.length - MAX_SELECT_OPTIONS, Math.max(0, clampedIdx - Math.floor(MAX_SELECT_OPTIONS / 2)));
        }
        const windowedContracts = crisisList.slice(startIdx, startIdx + MAX_SELECT_OPTIONS);
        const options = windowedContracts.map((c, offset) => {
            const idx = startIdx + offset;
            const descFn = t(lang, 'crisis_season_desc');
            const description = typeof descFn === 'function'
                ? descFn(c.highest ?? 0, c.challengeCount ?? 0)
                : `Highest ${c.highest ?? 0}`;
            return {
                label: (c.name || `Season ${idx + 1}`).slice(0, 100),
                description: description.slice(0, 100),
                value: String(idx),
                default: idx === clampedIdx,
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('crisis:selectSeason')
            .setPlaceholder(t(lang, 'crisis_select_season_placeholder'))
            .addOptions(options);
        components.push(new ActionRowBuilder().addComponents(selectMenu));
    }

    const summaryResult = await getCrisisSummary(user, currentContractId);
    if (!summaryResult.success) {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(t(lang, 'query_failed_title'))
            .setDescription(summaryResult.message)
            .setTimestamp();
        return { content: notice || null, embeds: [embed], files: [], components };
    }

    const bestRecord = summaryResult.data?.crisisContract?.history?.bestRecord;
    if (!bestRecord || !bestRecord.id) {
        const noRecordFn = t(lang, 'crisis_no_record_season_desc');
        const noRecordDesc = typeof noRecordFn === 'function'
            ? noRecordFn(currentContractName)
            : t(lang, 'crisis_no_record_desc');
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(t(lang, 'crisis_no_record_title'))
            .setDescription(noRecordDesc);
        return { content: notice || null, embeds: [embed], files: [], components };
    }

    const detailResult = await getCrisisDetail(user, bestRecord.id, currentContractId);
    if (!detailResult.success) {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(t(lang, 'query_failed_title'))
            .setDescription(detailResult.message)
            .setTimestamp();
        return { content: notice || null, embeds: [embed], files: [], components };
    }

    const originalId = summaryResult.data?.crisisContract?.dungeon?.originalId || '';
    const buffer = await drawCrisisUI(summaryResult, detailResult, uid, serverId, currentContractName, lang, {
        contractId: currentContractId,
        originalId,
        charMetaMap,
    });
    const fileName = `crisis_${uid}_${clampedIdx}.png`;
    const attachment = new AttachmentBuilder(buffer, { name: fileName });

    const embedTitleFn = t(lang, 'crisis_embed_title');
    const embedTitle = typeof embedTitleFn === 'function' ? embedTitleFn(currentContractName) : `${currentContractName} 作戰紀錄`;
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(embedTitle)
        .setImage(`attachment://${fileName}`);

    return { content: notice || null, embeds: [embed], files: [attachment], components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crisis')
        .setDescription('查詢危機合約作戰紀錄 / Query Crisis Contract record')
        .addStringOption(option =>
            option
                .setName('season')
                .setDescription('指定期數名稱或合約 ID（預設最新一期）/ Season name or contract ID')
                .setRequired(false)
        )
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel),

    async execute(interaction) {
        await interaction.deferReply();

        let lang = 'zh_Hant';
        try {
            const user = await User.findOne({ where: { discordId: interaction.user.id } });
            lang = resolveUserLang(user);

            if (!user || !user.cred || !user.uid) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_desc'));
                return interaction.editReply({ embeds: [embed] });
            }

            // 1. 取得角色卡片詳情以列出所有危機合約期數與幹員基礎資料
            const detailResultData = await getCardDetail(user);
            if (!detailResultData.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
                    .setDescription(detailResultData.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const rawCrisisList = detailResultData.detail?.crisisContract;
            if (!rawCrisisList || !Array.isArray(rawCrisisList) || rawCrisisList.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'crisis_no_activity_title'))
                    .setDescription(t(lang, 'crisis_no_activity_desc'));
                return interaction.editReply({ embeds: [embed] });
            }

            const crisisList = sortCrisisContracts(rawCrisisList);
            const charMetaMap = buildCharMetaMap(detailResultData.detail?.chars);

            let selectedIndex = 0;
            let notice = '';
            const seasonQuery = interaction.options.getString('season')?.trim();
            if (seasonQuery) {
                const qLower = seasonQuery.toLowerCase();
                const foundIdx = crisisList.findIndex(c =>
                    (c.id && c.id.toLowerCase() === qLower) ||
                    (c.name && c.name.toLowerCase().includes(qLower))
                );
                if (foundIdx !== -1) {
                    selectedIndex = foundIdx;
                } else {
                    const notFoundFn = t(lang, 'crisis_season_not_found');
                    const fallbackName = crisisList[0]?.name || 'Crisis Contract';
                    notice = typeof notFoundFn === 'function' ? notFoundFn(seasonQuery, fallbackName) : '';
                }
            }

            const payload = await buildCrisisPayload(user, crisisList, selectedIndex, charMetaMap, lang, notice);
            const message = await interaction.editReply(payload);

            if (crisisList.length > 1 && message?.id) {
                pruneExpiredStates();
                crisisViewState.set(message.id, {
                    userId: interaction.user.id,
                    crisisList,
                    charMetaMap,
                    lang,
                    expiresAt: Date.now() + VIEW_TTL_MS,
                });
            }
        } catch (error) {
            const { replyWithError } = require('../../utils/errorHelper');
            await replyWithError(interaction, error, lang);
        }
    },

    async handleSelectMenu(interaction, action) {
        if (action !== 'selectSeason') return;

        const state = crisisViewState.get(interaction.message.id);
        const lang = state?.lang || 'zh_Hant';

        if (!state || state.expiresAt < Date.now()) {
            crisisViewState.delete(interaction.message.id);
            return interaction.reply({
                content: t(lang, 'crisis_panel_expired'),
                ephemeral: true,
            });
        }

        if (interaction.user.id !== state.userId) {
            return interaction.reply({
                content: t(lang, 'crisis_panel_owner_only'),
                ephemeral: true,
            });
        }

        const nextIndex = Number.parseInt(interaction.values?.[0], 10);
        if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= state.crisisList.length) {
            return interaction.reply({
                content: t(lang, 'crisis_panel_invalid_option'),
                ephemeral: true,
            });
        }

        await interaction.deferUpdate();
        let activeLang = lang;
        try {
            const user = await User.findOne({ where: { discordId: interaction.user.id } });
            activeLang = resolveUserLang(user);
            state.lang = activeLang;

            if (!user || !user.cred || !user.uid) {
                crisisViewState.delete(interaction.message.id);
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(activeLang, 'not_bound_title'))
                    .setDescription(t(activeLang, 'not_bound_desc'));
                return interaction.editReply({ content: null, embeds: [embed], files: [], components: [] });
            }

            const payload = await buildCrisisPayload(user, state.crisisList, nextIndex, state.charMetaMap, activeLang);
            state.expiresAt = Date.now() + VIEW_TTL_MS;
            await interaction.editReply(payload);
        } catch (error) {
            const { replyWithError } = require('../../utils/errorHelper');
            await replyWithError(interaction, error, activeLang);
        }
    },
};
