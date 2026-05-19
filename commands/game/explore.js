const {
    SlashCommandBuilder,
    EmbedBuilder,
    AttachmentBuilder,
    ApplicationIntegrationType,
    InteractionContextType,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { createCanvas, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

const exploreViewState = new Map();
const EXPLORE_VIEW_TTL_MS = 10 * 60 * 1000;
const EXPLORE_COMPONENT_LIFETIME_MS = 10 * 1000;
const MAX_DOMAIN_OPTIONS = 25; // Discord String Select Menu max options
const MAX_CACHED_EXPLORE_VIEWS = 500;

function registerLangFont(langCode, familyName) {
    const weights = [
        { file: `NotoSans${langCode}-Regular.ttf`, weight: 'normal' },
        { file: `NotoSans${langCode}-Bold.ttf`, weight: 'bold' },
        { file: `NotoSans${langCode}-Black.ttf`, weight: '900' }
    ];

    for (const { file, weight } of weights) {
        const fontPath = path.resolve(__dirname, `../../assets/font/${file}`);
        if (fs.existsSync(fontPath)) {
            registerFont(fontPath, { family: familyName, weight });
        } else {
            console.warn(`[Canvas] ⚠️ Missing font file: ${file}`);
        }
    }
}

try {
    registerLangFont('TC', 'Noto Sans TC');
    registerLangFont('SC', 'Noto Sans SC');
    registerLangFont('JP', 'Noto Sans JP');
} catch (error) {
    console.error('[Canvas] ⚠️ Failed to load explore fonts', error.message);
}

const colors = {
    bg: '#FFFFFF',
    grid: '#E5E5E8',
    panelBg: '#F1F1F4',
    border: '#D5D5D8',
    yellow: '#F4D216',
    headerBg: '#E8E8E8',
    black: '#000000',
    badgeBg: '#11131A',
    textMain: '#101012',
    textSub: '#4F4F52',
    textLight: '#B0B0B5',
    progressBg: '#DADADA'
};

function getFontFamily(lang) {
    switch (lang) {
        case 'zh_Hans': return 'Noto Sans SC';
        case 'ja': return 'Noto Sans JP';
        case 'zh_Hant':
        case 'en':
        default: return 'Noto Sans TC';
    }
}

function getText(lang, key, fallback) {
    const translated = t(lang, key);
    return translated === key ? fallback : translated;
}

function drawPolygon(ctx, points, fill, stroke = null, lineWidth = 1) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
}

function drawText(ctx, lang, text, x, y, size, color, align = 'left', weight = 'normal', italic = false) {
    const fontStyle = italic ? 'italic ' : '';
    const family = getFontFamily(lang);
    ctx.fillStyle = color;
    ctx.font = `${fontStyle}${weight} ${size}px "${family}"`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

function drawTechBar(ctx, x, y, w, h, progress, max, color) {
    const slant = 10;
    drawPolygon(ctx, [
        { x, y }, { x: x + w, y },
        { x: x + w - slant, y: y + h }, { x: x - slant, y: y + h }
    ], colors.progressBg);

    const safeMax = max > 0 ? max : 1;
    const fillWidth = Math.max(0, Math.min(w, (progress / safeMax) * w));
    if (fillWidth > 0) {
        drawPolygon(ctx, [
            { x, y }, { x: x + fillWidth, y },
            { x: x + fillWidth - slant, y: y + h }, { x: x - slant, y: y + h }
        ], color);
    }
}

function drawBadge(ctx, lang, text, x, y) {
    const family = getFontFamily(lang);
    ctx.textBaseline = 'middle';
    ctx.font = `bold 13px "${family}"`;
    ctx.textAlign = 'center';

    if (text === '-') {
        ctx.fillStyle = colors.textLight;
        ctx.fillText('-', x, y);
        return;
    }

    if (!text.includes('/')) {
        ctx.fillStyle = colors.textMain;
        ctx.fillText(text, x, y);
        return;
    }

    const parts = text.split('/');
    const current = parts[0].trim();
    const max = parts[1].trim();

    if (current === max) {
        const bw = 70;
        const bh = 22;
        const slant = 8;
        drawPolygon(ctx, [
            { x: x - bw / 2 + slant, y: y - bh / 2 },
            { x: x + bw / 2, y: y - bh / 2 },
            { x: x + bw / 2 - slant, y: y + bh / 2 },
            { x: x - bw / 2, y: y + bh / 2 }
        ], colors.badgeBg);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, x, y);
    } else {
        const maxStr = ` / ${max}`;
        const curWidth = ctx.measureText(current).width;
        const maxWidth = ctx.measureText(maxStr).width;
        const totalWidth = curWidth + maxWidth;
        const startX = x - totalWidth / 2;

        ctx.textAlign = 'left';
        ctx.fillStyle = colors.textMain;
        ctx.fillText(current, startX, y);

        ctx.fillStyle = colors.textLight;
        ctx.fillText(maxStr, startX + curWidth, y);
    }
}

function formatProgress(data) {
    if (!data || data.total == null || data.total <= 0) return '-';
    const count = Number.parseInt(data.count, 10) || 0;
    const total = Number.parseInt(data.total, 10) || 0;
    return `${count}/${total}`;
}

function formatDomainCurrency(domain) {
    const count = Number.parseInt(domain?.moneyMgr?.count, 10) || 0;
    const total = Number.parseInt(domain?.moneyMgr?.total, 10) || 0;
    return {
        count,
        total,
        countText: count.toLocaleString(),
        totalText: total.toLocaleString(),
    };
}

function hasProgressData(data) {
    return Boolean(data && data.total != null && Number.parseInt(data.total, 10) > 0);
}

function shouldShowEquipColumn(domain) {
    const levels = Array.isArray(domain?.levels) ? domain.levels : [];
    return levels.some((lv) => hasProgressData(lv?.equipTrchestCount));
}

function safeDomainRows(domain, showEquipColumn = false) {
    const levels = Array.isArray(domain?.levels) ? domain.levels : [];
    return levels.slice(0, 6).map((lv) => ({
        name: lv?.name || '-',
        data: [
            formatProgress(lv?.trchestCount),
            formatProgress(lv?.blackboxCount),
            formatProgress(lv?.puzzleCount),
            formatProgress(lv?.pieceCount),
            ...(showEquipColumn ? [formatProgress(lv?.equipTrchestCount)] : []),
        ]
    }));
}

function getExploreEmbedTitle(lang, domainName, domainLevel) {
    const titleTemplate = t(lang, 'explore_title');
    if (typeof titleTemplate === 'function') {
        return titleTemplate(domainName, domainLevel);
    }
    return `${domainName} (${domainLevel})`;
}

function getExploreCurrencyLabel(lang, domainName) {
    const labelTemplate = t(lang, 'explore_currency');
    if (typeof labelTemplate === 'function') {
        return labelTemplate(domainName);
    }
    return `${domainName} ${getText(lang, 'explore_currency', '調度卷')}`;
}

function clampIndex(index, length) {
    if (length <= 0) return 0;
    if (index < 0) return length - 1;
    if (index >= length) return 0;
    return index;
}

function buildExploreComponents(domains, currentIndex, lang) {
    const disableSwitch = domains.length <= 1;
    const options = domains.map((domain, index) => ({
        label: (domain?.name || `Domain ${index + 1}`).substring(0, 100),
        description: `${getText(lang, 'img_explore_level', '探索等級')} ${Number.parseInt(domain?.level, 10) || 0}`.substring(0, 100),
        value: `${index}`,
        default: index === currentIndex,
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('explore:selectDomain')
        .setPlaceholder(getText(lang, 'img_subzone', '分區'))
        .setDisabled(disableSwitch)
        .addOptions(options);

    const switchButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('explore:prevDomain')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
            .setDisabled(disableSwitch),
        new ButtonBuilder()
            .setCustomId('explore:nextDomain')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️')
            .setDisabled(disableSwitch)
    );

    return [
        new ActionRowBuilder().addComponents(selectMenu),
        switchButtons,
    ];
}

async function buildExplorePayload(domains, index, lang) {
    const currentIndex = clampIndex(index, domains.length);
    const card = await generateExploreImage(domains[currentIndex], lang);
    const fileName = 'endfield_explore.png';
    const attachment = new AttachmentBuilder(card.buffer, { name: fileName });
    const embed = new EmbedBuilder()
        .setColor(0xF4D216)
        .setTitle(getExploreEmbedTitle(lang, card.domainName, card.domainLevel))
        .setImage(`attachment://${fileName}`)
        .setFooter({ text: t(lang, 'bot_name') })
        .setTimestamp();
    return {
        currentIndex,
        embed,
        attachment,
        components: buildExploreComponents(domains, currentIndex, lang),
    };
}

function setExploreState(messageId, state) {
    while (exploreViewState.size >= MAX_CACHED_EXPLORE_VIEWS) {
        const oldestKey = exploreViewState.keys().next().value;
        if (!oldestKey) break;
        clearExploreState(oldestKey);
    }

    const existing = exploreViewState.get(messageId);
    if (existing?.timeoutId) clearTimeout(existing.timeoutId);
    const timeoutId = setTimeout(() => {
        exploreViewState.delete(messageId);
    }, EXPLORE_VIEW_TTL_MS);
    if (typeof timeoutId.unref === 'function') timeoutId.unref();
    exploreViewState.set(messageId, { ...state, timeoutId, expiresAt: Date.now() + EXPLORE_VIEW_TTL_MS });
}

function clearExploreState(messageId) {
    const existing = exploreViewState.get(messageId);
    if (!existing) return;
    if (existing.timeoutId) clearTimeout(existing.timeoutId);
    if (existing.controlsTimeoutId) clearTimeout(existing.controlsTimeoutId);
    exploreViewState.delete(messageId);
}

function resolveInteractionLang(interaction, stateLang) {
    if (stateLang) return stateLang;
    const locale = interaction?.locale || '';
    if (locale.startsWith('ja')) return 'ja';
    if (locale.startsWith('zh-CN')) return 'zh_Hans';
    if (locale.startsWith('zh-TW') || locale.startsWith('zh-HK')) return 'zh_Hant';
    return 'en';
}

function getExploreInteractionText(lang, key) {
    const fallbackByKey = {
        explore_panel_expired: 'This explore panel has expired. Please run /explore again.',
        explore_panel_owner_only: 'Only the command user can switch this explore panel.',
        explore_panel_invalid_option: 'Invalid domain option.',
    };
    return getText(lang, key, fallbackByKey[key] || 'Unknown error.');
}

async function generateExploreImage(domain, lang) {
    const width = 1000;
    const height = 620;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const domainName = domain.name || '-';
    const domainLevel = Number.parseInt(domain.level, 10) || 0;
    const currency = formatDomainCurrency(domain);
    const showEquipColumn = shouldShowEquipColumn(domain);
    const rows = safeDomainRows(domain, showEquipColumn);
    const updatedAt = new Date();
    const updateTime = updatedAt.toLocaleString(lang === 'ja' ? 'ja-JP' : lang === 'en' ? 'en-US' : 'zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
    }
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
    }

    drawPolygon(ctx, [{ x: 40, y: 40 }, { x: 320, y: 40 }, { x: 320, y: 110 }, { x: 300, y: 130 }, { x: 40, y: 130 }], colors.yellow);
    drawText(ctx, lang, getText(lang, 'img_explore_level', '探索等級'), 55, 65, 14, colors.black, 'left', '900');
    drawText(ctx, lang, `${domainLevel}`, 50, 100, 48, colors.black, 'left', '900');

    ctx.save();
    ctx.beginPath();
    ctx.rect(220, 40, 100, 90);
    ctx.clip();
    ctx.strokeStyle = colors.black;
    ctx.lineWidth = 6;
    for (let i = 200; i < 350; i += 15) {
        ctx.beginPath();
        ctx.moveTo(i, 40);
        ctx.lineTo(i - 40, 130);
        ctx.stroke();
    }
    ctx.restore();

    drawPolygon(ctx, [{ x: 40, y: 145 }, { x: 320, y: 145 }, { x: 320, y: 345 }, { x: 40, y: 345 }], colors.panelBg, colors.border, 2);

    drawText(ctx, lang, domainName, 63, 180, 28, colors.textMain, 'left', 'bold');
    drawText(ctx, lang, getExploreCurrencyLabel(lang, domainName), 63, 240, 13, colors.textMain, 'left', 'bold');

    const family = getFontFamily(lang);
    ctx.font = `bold 16px "${family}"`;
    const maxStr = ` / ${currency.totalText}`;
    const curStr = currency.countText;
    const rightEdgeX = 295;
    ctx.textAlign = 'right';
    ctx.fillStyle = colors.textLight;
    ctx.fillText(maxStr, rightEdgeX, 265);
    const maxStrWidth = ctx.measureText(maxStr).width;
    ctx.fillStyle = colors.textMain;
    ctx.fillText(curStr, rightEdgeX - maxStrWidth, 265);

    drawTechBar(ctx, 60, 280, 240, 10, currency.count, currency.total, colors.yellow);
    drawText(ctx, lang, `${getText(lang, 'img_update_time', 'Updated')}: ${updateTime}`, 60, 315, 12, colors.textSub);
    drawText(ctx, lang, `// ${getText(lang, 'img_explore_overview', 'Regional Overview')}`, 360, 60, 24, colors.textMain, 'left', '900');

    const tableX = 360;
    const tableY = 85;
    const tableW = 600;
    const tableH = 495;
    drawPolygon(ctx, [
        { x: tableX, y: tableY }, { x: tableX + tableW, y: tableY },
        { x: tableX + tableW, y: tableY + tableH }, { x: tableX, y: tableY + tableH }
    ], colors.panelBg, colors.border, 2);

    const headerHeight = 45;
    drawPolygon(ctx, [
        { x: tableX, y: tableY }, { x: tableX + tableW, y: tableY },
        { x: tableX + tableW, y: tableY + headerHeight }, { x: tableX, y: tableY + headerHeight }
    ], colors.headerBg);

    ctx.beginPath();
    ctx.moveTo(tableX, tableY + headerHeight);
    ctx.lineTo(tableX + tableW, tableY + headerHeight);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const colX = showEquipColumn
        ? [tableX + 30, tableX + 135, tableX + 235, tableX + 335, tableX + 435, tableX + 535]
        : [tableX + 40, tableX + 200, tableX + 315, tableX + 430, tableX + 540];
    const headers = [
        getText(lang, 'img_subzone', '分區'),
        getText(lang, 'explore_treasure', '儲藏箱'),
        getText(lang, 'explore_blackbox', '協議採錄樁'),
        getText(lang, 'explore_puzzle', '謎質'),
        getText(lang, 'explore_piece', '維修靈感點'),
        ...(showEquipColumn ? [getText(lang, 'explore_equip', '裝備模板箱')] : []),
    ];
    const headerFontSize = showEquipColumn ? 13 : 14;
    drawText(ctx, lang, headers[0], colX[0], tableY + 23, headerFontSize, colors.textMain, 'left', 'bold');
    for (let i = 1; i < headers.length; i++) {
        drawText(ctx, lang, headers[i], colX[i], tableY + 23, headerFontSize, colors.textMain, 'center', 'bold');
    }

    const paddedRows = [...rows];
    while (paddedRows.length < 6) {
        paddedRows.push({ name: '-', data: Array(headers.length - 1).fill('-') });
    }
    const rowHeight = 75;
    paddedRows.forEach((row, index) => {
        const rowCenterY = tableY + headerHeight + 37.5 + (index * rowHeight);
        drawText(ctx, lang, row.name, colX[0], rowCenterY, 14, colors.textMain, 'left', 'bold');
        row.data.forEach((val, i) => drawBadge(ctx, lang, val, colX[i + 1], rowCenterY));

        if (index < paddedRows.length - 1) {
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(tableX + (showEquipColumn ? 20 : 30), rowCenterY + (rowHeight / 2));
            ctx.lineTo(tableX + tableW - (showEquipColumn ? 20 : 30), rowCenterY + (rowHeight / 2));
            ctx.strokeStyle = colors.border;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    });

    ctx.save();
    ctx.font = `bold 12px "${family}"`;
    ctx.fillStyle = 'rgba(79, 79, 82, 0.4)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(getText(lang, 'bot_name', '終末地簽到小助手'), width - 20, height - 10);
    ctx.restore();

    return {
        buffer: canvas.toBuffer('image/png'),
        domainName,
        domainLevel,
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('explore')
        .setDescription('查詢各區域探索進度 / View exploration progress')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        let lang = 'zh_Hant';
        try {
            const discordId = interaction.user.id;
            const user = await User.findByPk(discordId);
            lang = user?.language || 'zh_Hant';

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

            const limitedDomains = domains.slice(0, MAX_DOMAIN_OPTIONS);
            const payload = await buildExplorePayload(limitedDomains, 0, lang);
            const message = await interaction.editReply({
                embeds: [payload.embed],
                files: [payload.attachment],
                components: payload.components,
            });
            const controlsTimeoutId = setTimeout(async () => {
                clearExploreState(message.id);
                try {
                    await message.edit({ components: [] });
                } catch (removeError) {
                    console.warn('[explore] Failed to remove expired controls', removeError?.message || removeError);
                }
            }, EXPLORE_COMPONENT_LIFETIME_MS);
            if (typeof controlsTimeoutId.unref === 'function') controlsTimeoutId.unref();
            setExploreState(message.id, {
                userId: interaction.user.id,
                lang,
                domains: limitedDomains,
                currentIndex: payload.currentIndex,
                controlsTimeoutId,
            });
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
    async handleButton(interaction, action) {
        const state = exploreViewState.get(interaction.message.id);
        const lang = resolveInteractionLang(interaction, state?.lang);
        if (!state || state.expiresAt < Date.now()) {
            clearExploreState(interaction.message.id);
            return interaction.reply({
                content: getExploreInteractionText(lang, 'explore_panel_expired'),
                ephemeral: true
            });
        }
        if (interaction.user.id !== state.userId) {
            return interaction.reply({
                content: getExploreInteractionText(lang, 'explore_panel_owner_only'),
                ephemeral: true
            });
        }

        const delta = action === 'prevDomain' ? -1 : action === 'nextDomain' ? 1 : 0;
        if (delta === 0) return;
        const nextIndex = clampIndex(state.currentIndex + delta, state.domains.length);
        const payload = await buildExplorePayload(state.domains, nextIndex, state.lang);
        setExploreState(interaction.message.id, {
            ...state,
            currentIndex: payload.currentIndex,
        });
        await interaction.update({
            embeds: [payload.embed],
            files: [payload.attachment],
            components: payload.components,
        });
    },
    async handleSelectMenu(interaction, action) {
        if (action !== 'selectDomain') return;

        const state = exploreViewState.get(interaction.message.id);
        const lang = resolveInteractionLang(interaction, state?.lang);
        if (!state || state.expiresAt < Date.now()) {
            clearExploreState(interaction.message.id);
            return interaction.reply({
                content: getExploreInteractionText(lang, 'explore_panel_expired'),
                ephemeral: true
            });
        }
        if (interaction.user.id !== state.userId) {
            return interaction.reply({
                content: getExploreInteractionText(lang, 'explore_panel_owner_only'),
                ephemeral: true
            });
        }

        const selected = Number.parseInt(interaction.values?.[0], 10);
        if (!Number.isInteger(selected)) {
            return interaction.reply({
                content: getExploreInteractionText(lang, 'explore_panel_invalid_option'),
                ephemeral: true
            });
        }

        const payload = await buildExplorePayload(state.domains, selected, state.lang);
        setExploreState(interaction.message.id, {
            ...state,
            currentIndex: payload.currentIndex,
        });
        await interaction.update({
            embeds: [payload.embed],
            files: [payload.attachment],
            components: payload.components,
        });
    },
};
