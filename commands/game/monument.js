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
const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const User = require('../../models/User');
const { getIndieHardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');
const { ELEMENT_ICONS, ELEMENT_COLORS, RARITY_COLORS } = require('../../utils/operatorEnums');

// 儲存各使用者面板的互動狀態，防呆並定時清理
const monumentViewState = new Map();
const MONUMENT_VIEW_TTL_MS = 10 * 60 * 1000; // 面板會話最大生存時間 (10 分鐘)
const MONUMENT_COMPONENT_LIFETIME_MS = 10 * 1000; // 按鈕與選單等組件有效時間 (10 秒)
const MAX_CACHED_MONUMENT_VIEWS = 500; // 記憶體中最大快取面板數量

// 全局圖片快取，避免重複下載
const imageCache = new Map();

async function loadCachedImage(url) {
    if (!url) return null;
    if (imageCache.has(url)) {
        return imageCache.get(url);
    }
    try {
        const img = await loadImage(url);
        imageCache.set(url, img);
        return img;
    } catch (e) {
        console.error(`[Canvas] ⚠️ 載入圖片失敗: ${url}`, e.message);
        return null;
    }
}

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
    console.error('[Canvas] ⚠️ Failed to load monument fonts', error.message);
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
    progressBg: '#DADADA',
    green: '#2ecc71',
    red: '#e74c3c'
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

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

async function drawPropertyIcon(ctx, x, y, size, propKey) {
    ctx.save();
    
    // 從 operatorEnums 取得屬性的官方背景顏色
    const bgColor = ELEMENT_COLORS[propKey] || '#888888';
    
    ctx.fillStyle = bgColor;
    drawRoundedRect(ctx, x, y, size, size, 1.5, true, false);
    
    // 從快取中加載官方屬性圖標並利用臨時畫布將灰色圖標染成純白色
    const iconUrl = ELEMENT_ICONS[propKey];
    if (iconUrl) {
        const iconImg = await loadCachedImage(iconUrl);
        if (iconImg) {
            const iconSize = size - 2;
            const tempCanvas = createCanvas(iconSize, iconSize);
            const tempCtx = tempCanvas.getContext('2d');
            
            tempCtx.drawImage(iconImg, 0, 0, iconSize, iconSize);
            tempCtx.globalCompositeOperation = 'source-in';
            tempCtx.fillStyle = '#FFFFFF';
            tempCtx.fillRect(0, 0, iconSize, iconSize);
            
            ctx.drawImage(tempCanvas, x + 1, y + 1);
        }
    }
    
    ctx.restore();
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius, fill, stroke) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
    }
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

const potentialImagesCache = new Map();

async function getPotentialImage(level) {
    if (potentialImagesCache.has(level)) {
        return potentialImagesCache.get(level);
    }
    const imgPath = path.resolve(__dirname, `../../assets/images/operators/Potential_${level}.png`);
    if (fs.existsSync(imgPath)) {
        try {
            const img = await loadImage(imgPath);
            potentialImagesCache.set(level, img);
            return img;
        } catch (e) {
            console.error(`[monument] ⚠️ 載入本地潛能圖片失敗: Potential_${level}.png`, e.message);
        }
    }
    return null;
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

// 備用金色六角形徽章 (若未加載到網路蝕刻章圖片時使用)
function drawGoldBadge(ctx, lang, x, y, size) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        points.push({
            x: x + size * Math.cos(angle),
            y: y + size * Math.sin(angle)
        });
    }
    drawPolygon(ctx, points, '#1A1C20', colors.yellow, 2);

    const innerPoints = [];
    for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        innerPoints.push({
            x: x + (size - 4) * Math.cos(angle),
            y: y + (size - 4) * Math.sin(angle)
        });
    }
    drawPolygon(ctx, innerPoints, null, colors.yellow, 1);

    drawText(ctx, lang, '✦', x, y - 2, 16, colors.yellow, 'center', '900');
    drawText(ctx, lang, getText(lang, 'monument_plated', '蝕刻章已鍍層'), x + size + 15, y, 13, '#D4AF37', 'left', 'bold');
}

// 繪製關卡難度的通關狀態 Badge
function drawPassBadge(ctx, lang, isPass, x, y) {
    const family = getFontFamily(lang);
    ctx.textBaseline = 'middle';
    ctx.font = `bold 12px "${family}"`;
    ctx.textAlign = 'center';

    const text = isPass 
        ? getText(lang, 'img_monument_pass', '已通關')
        : getText(lang, 'img_monument_not_pass', '未通關');

    const bw = 70;
    const bh = 22;
    const slant = 6;

    const bgFill = isPass ? colors.badgeBg : '#E5E5E8';
    const textFill = isPass ? colors.green : colors.textLight;

    drawPolygon(ctx, [
        { x: x - bw / 2 + slant, y: y - bh / 2 },
        { x: x + bw / 2, y: y - bh / 2 },
        { x: x + bw / 2 - slant, y: y + bh / 2 },
        { x: x - bw / 2, y: y + bh / 2 }
    ], bgFill);

    ctx.fillStyle = textFill;
    ctx.fillText(text, x, y);
}

function clampIndex(index, length) {
    if (length <= 0) return 0;
    if (index < 0) return 0;
    if (index >= length) return length - 1;
    return index;
}

// 格式化通關秒數為分秒 (mm:ss)
function formatPassTime(secs) {
    if (secs == null || isNaN(secs)) return '-';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// 格式化 Unix 時間戳為日期時間
function formatTimestamp(ts) {
    if (!ts) return '-';
    const date = new Date(ts * 1000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${d} ${hh}:${mm}`;
}

// 動態建構選單與按鈕組件
function buildMonumentComponents(groups, currentIndex, difficulty, lang) {
    const disableSwitch = groups.length <= 1;
    
    const options = groups.map((g, index) => ({
        label: (g?.name || `Series ${index + 1}`).substring(0, 100),
        value: `${index}`,
        default: index === currentIndex,
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('monument:selectGroup')
        .setPlaceholder(getText(lang, 'monument_no_data_title', '影拓豐碑'))
        .setDisabled(disableSwitch)
        .addOptions(options);

    const isFirstPage = currentIndex === 0;
    const isLastPage = currentIndex === groups.length - 1;

    const prevGroupName = !isFirstPage && groups[currentIndex - 1]?.name 
        ? groups[currentIndex - 1].name 
        : getText(lang, 'btn_prev', '上一頁');
        
    const nextGroupName = !isLastPage && groups[currentIndex + 1]?.name 
        ? groups[currentIndex + 1].name 
        : getText(lang, 'btn_next', '下一頁');

    const switchButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('monument:prevGroup')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
            .setLabel(prevGroupName.substring(0, 80)) 
            .setDisabled(isFirstPage),
            
        new ButtonBuilder()
            .setCustomId('monument:toggleDifficulty')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⚔️')
            .setLabel(difficulty === 'hard' 
                ? getText(lang, 'monument_normal_btn', '切換至普通難度') 
                : getText(lang, 'monument_agony_btn', '切換至苦難難度')),

        new ButtonBuilder()
            .setCustomId('monument:nextGroup')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️')
            .setLabel(nextGroupName.substring(0, 80))
            .setDisabled(isLastPage)
    );

    return [
        new ActionRowBuilder().addComponents(selectMenu),
        switchButtons,
    ];
}

// 建立回傳給 Discord 的 Embed 和 Attachment 負載
async function buildMonumentPayload(indieHard, index, difficulty, lang) {
    const groups = indieHard.indieHardGroups || [];
    const currentIndex = clampIndex(index, groups.length);
    const targetGroup = groups[currentIndex];
    
    // 💡 預先並行加載當前畫布需要的所有網絡圖片，防呆超時
    const urlsToLoad = [];
    if (targetGroup?.pic) urlsToLoad.push(targetGroup.pic);
    
    // 載入實體蝕刻章圖片 (initIcon / platedIcon)
    const achieve = targetGroup?.achieve;
    if (achieve && achieve.achievementData) {
        const iconUrl = achieve.isPlated ? achieve.achievementData.platedIcon : achieve.achievementData.initIcon;
        if (iconUrl) urlsToLoad.push(iconUrl);
    }
    
    const dungeons = targetGroup?.dungeonGroups || [];
    dungeons.forEach(d => {
        const record = difficulty === 'hard' ? d.hardDungeon?.bestRecord : d.normalDungeon?.bestRecord;
        if (record && Array.isArray(record.chars)) {
            record.chars.forEach(c => {
                if (c.avatarUrl) urlsToLoad.push(c.avatarUrl);
                if (c.property && c.property.key) {
                    const iconUrl = ELEMENT_ICONS[c.property.key];
                    if (iconUrl) urlsToLoad.push(iconUrl);
                }
            });
        }
    });

    // 並行載入所有圖片至快取
    await Promise.all(urlsToLoad.map(url => loadCachedImage(url)));

    const card = await generateMonumentImage(indieHard, currentIndex, difficulty, lang);

    const fileName = 'endfield_monument.png';
    const attachment = new AttachmentBuilder(card.buffer, { name: fileName });
    
    const modeSuffix = difficulty === 'hard'
        ? ` [${getText(lang, 'monument_agony', '苦難')}]`
        : '';
        
    const embed = new EmbedBuilder()
        .setColor(0xF4D216)
        .setTitle(typeof t(lang, 'monument_title') === 'function' 
            ? t(lang, 'monument_title')(`${card.groupName}${modeSuffix}`) 
            : `${card.groupName}${modeSuffix} 進度`)
        .setImage(`attachment://${fileName}`)
        .setFooter({ text: t(lang, 'bot_name') })
        .setTimestamp();

    return {
        currentIndex,
        embed,
        attachment,
        components: buildMonumentComponents(groups, currentIndex, difficulty, lang),
    };
}

function setMonumentState(messageId, state) {
    while (monumentViewState.size >= MAX_CACHED_MONUMENT_VIEWS) {
        const oldestKey = monumentViewState.keys().next().value;
        if (!oldestKey) break;
        clearMonumentState(oldestKey);
    }

    const existing = monumentViewState.get(messageId);
    if (existing?.timeoutId) clearTimeout(existing.timeoutId);
    if (existing?.controlsTimeoutId) clearTimeout(existing.controlsTimeoutId);

    const timeoutId = setTimeout(() => {
        monumentViewState.delete(messageId);
    }, MONUMENT_VIEW_TTL_MS);
    
    if (typeof timeoutId.unref === 'function') timeoutId.unref();
    
    monumentViewState.set(messageId, { ...state, timeoutId, expiresAt: Date.now() + MONUMENT_VIEW_TTL_MS });
}

function clearMonumentState(messageId) {
    const existing = monumentViewState.get(messageId);
    if (!existing) return;
    if (existing.timeoutId) clearTimeout(existing.timeoutId);
    if (existing.controlsTimeoutId) clearTimeout(existing.controlsTimeoutId);
    monumentViewState.delete(messageId);
}

function refreshControlsTimer(message) {
    const state = monumentViewState.get(message.id);
    if (!state) return;

    if (state.controlsTimeoutId) {
        clearTimeout(state.controlsTimeoutId);
    }

    const newTimeoutId = setTimeout(async () => {
        try {
            await message.edit({ components: [] });
            clearMonumentState(message.id);
        } catch (removeError) {
            console.warn('[monument] 移除過期按鈕失敗', removeError?.message || removeError);
        }
    }, MONUMENT_COMPONENT_LIFETIME_MS);

    if (typeof newTimeoutId.unref === 'function') newTimeoutId.unref();

    state.controlsTimeoutId = newTimeoutId;
}

function resolveInteractionLang(interaction, stateLang) {
    if (stateLang) return stateLang;
    const locale = interaction?.locale || '';
    if (locale.startsWith('ja')) return 'ja';
    if (locale.startsWith('zh-CN')) return 'zh_Hans';
    if (locale.startsWith('zh-TW') || locale.startsWith('zh-HK')) return 'zh_Hant';
    return 'en';
}

function getMonumentInteractionText(lang, key) {
    const fallbackByKey = {
        monument_panel_expired: 'This panel has expired. Please run /monument again.',
        monument_panel_owner_only: 'Only the command user can switch this panel.',
        monument_panel_invalid_option: 'Invalid series option.',
    };
    return getText(lang, key, fallbackByKey[key] || 'Unknown error.');
}

// 主繪圖邏輯：繪製影拓豐碑資訊圖卡 (含陣容與時間資訊)
async function generateMonumentImage(indieHard, selectedIndex, difficulty, lang) {
    const width = 1000;
    const height = 620;
    const scale = 2; // 雙倍 Retina 高清渲染
    const canvas = createCanvas(width * scale, height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const groups = indieHard.indieHardGroups || [];
    const targetGroup = groups[selectedIndex];
    const groupName = targetGroup?.name || '-';

    // 1. 計算總通關數據
    let totalNormalPass = 0;
    let totalNormalCount = 0;
    let totalHardPass = 0;
    let totalHardCount = 0;

    groups.forEach(g => {
        g.dungeonGroups.forEach(d => {
            if (d.normalDungeon) {
                totalNormalCount++;
                if (d.normalDungeon.isPass) totalNormalPass++;
            }
            if (d.hardDungeon) {
                totalHardCount++;
                if (d.hardDungeon.isPass) totalHardPass++;
            }
        });
    });

    const isAllCleared = (totalNormalPass + totalHardPass) === (totalNormalCount + totalHardCount);

    const updatedAt = new Date();
    const updateTime = updatedAt.toLocaleString(lang === 'ja' ? 'ja-JP' : lang === 'en' ? 'en-US' : 'zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    // 2. 繪製背景與網格
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }

    // 3. 左上角標題裝飾區塊
    drawPolygon(ctx, [{ x: 40, y: 40 }, { x: 320, y: 40 }, { x: 320, y: 110 }, { x: 300, y: 130 }, { x: 40, y: 130 }], colors.yellow);
    drawText(ctx, lang, getText(lang, 'img_monument_overview', '影拓豐碑總覽'), 55, 65, 14, colors.black, 'left', '900');
    drawText(ctx, lang, `${totalNormalPass + totalHardPass}`, 50, 100, 48, colors.black, 'left', '900');
    drawText(ctx, lang, `/ ${totalNormalCount + totalHardCount}`, 120, 108, 18, colors.black, 'left', 'bold');

    ctx.save();
    ctx.beginPath(); ctx.rect(220, 40, 100, 90); ctx.clip();
    ctx.strokeStyle = colors.black; ctx.lineWidth = 6;
    for (let i = 200; i < 350; i += 15) {
        ctx.beginPath(); ctx.moveTo(i, 40); ctx.lineTo(i - 40, 130); ctx.stroke();
    }
    ctx.restore();

    // 4. 左側資訊面板
    drawPolygon(ctx, [{ x: 40, y: 145 }, { x: 320, y: 145 }, { x: 320, y: 560 }, { x: 40, y: 560 }], colors.panelBg, colors.border, 2);

    // 💡 繪製直立大封面海報 (寬 260，高 325，4:5 比例)
    if (targetGroup?.pic) {
        const bannerImg = await loadCachedImage(targetGroup.pic);
        if (bannerImg) {
            ctx.drawImage(bannerImg, 50, 155, 260, 325);
        }
    }

    // 繪製實體蝕刻章與系列狀態 (放置於海報下方的並列空間)
    const achieve = targetGroup?.achieve;
    let hasDrawnBadge = false;
    if (achieve && achieve.achievementData) {
        const isPlated = achieve.isPlated || false;
        const iconUrl = isPlated ? achieve.achievementData.platedIcon : achieve.achievementData.initIcon;
        if (iconUrl) {
            const badgeImg = await loadCachedImage(iconUrl);
            if (badgeImg) {
                // 繪製實體蝕刻章 (X=60, Y=496, 寬高 48)
                ctx.drawImage(badgeImg, 60, 496, 48, 48);
                hasDrawnBadge = true;
                
                const statusText = isPlated 
                    ? getText(lang, 'monument_plated', '蝕刻章已鍍層') 
                    : getText(lang, 'monument_not_plated', '蝕刻章未鍍層');
                
                // 系列名稱
                drawText(ctx, lang, groupName, 120, 506, 15, colors.textMain, 'left', 'bold');
                
                // 狀態膠囊 Badge (黑色底金黃字，對比度極高)
                const badgeX = 120;
                const badgeY = 519;
                const badgeW = 95;
                const badgeH = 17;
                
                ctx.save();
                ctx.fillStyle = isPlated ? '#11131A' : '#E5E5E8';
                drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 3, true, false);
                
                const textColor = isPlated ? '#F4D216' : '#7F7F84';
                drawText(ctx, lang, statusText, badgeX + badgeW / 2, badgeY + badgeH / 2, 10, textColor, 'center', 'bold');
                ctx.restore();
            }
        }
    }

    // 若網路圖片載入失敗，降級使用內建幾何圖案
    if (!hasDrawnBadge) {
        if (isAllCleared) {
            drawGoldBadge(ctx, lang, 84, 520, 20);
            drawText(ctx, lang, groupName, 124, 500, 14, colors.textMain, 'left', 'bold');
        } else {
            drawText(ctx, lang, groupName, 60, 520, 16, colors.textMain, 'left', 'bold');
        }
    }

    // 更新時間靠右下角對齊
    drawText(ctx, lang, `${getText(lang, 'img_update_time', 'Updated')}: ${updateTime}`, 305, 540, 10, colors.textSub, 'right');

    // 5. 右側表格面板 (單一難度的最佳紀錄)
    const modeLabel = difficulty === 'hard' 
        ? ` - ${getText(lang, 'monument_agony', '苦難')}` 
        : '';
        
    drawText(ctx, lang, `// ${groupName.toUpperCase()}${modeLabel}`, 360, 60, 20, colors.textMain, 'left', '900');

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

    // 欄位標題與橫座標分配
    const colX = [tableX + 25, tableX + 225, tableX + 285, tableX + 540];
    const headers = [
        getText(lang, 'monument_best_record', '最佳通關紀錄'),
        getText(lang, 'monument_pass_time', '通關時間'),
        getText(lang, 'monument_lineup', '通關陣容'),
        getText(lang, 'monument_status', '狀態')
    ];
    drawText(ctx, lang, headers[0], colX[0], tableY + 23, 13, colors.textMain, 'left', 'bold');
    drawText(ctx, lang, headers[1], colX[1], tableY + 23, 13, colors.textMain, 'center', 'bold');
    drawText(ctx, lang, headers[2], colX[2], tableY + 23, 13, colors.textMain, 'left', 'bold');
    drawText(ctx, lang, headers[3], colX[3], tableY + 23, 13, colors.textMain, 'center', 'bold');

    const dungeons = targetGroup?.dungeonGroups || [];
    const maxRows = 6;
    const rowHeight = 75;

    for (let index = 0; index < maxRows; index++) {
        const rowCenterY = tableY + headerHeight + 37.5 + (index * rowHeight);
        const dungeon = dungeons[index];

        if (dungeon) {
            const currentDungeon = difficulty === 'hard' ? dungeon.hardDungeon : dungeon.normalDungeon;
            
            if (currentDungeon) {
                const isPass = currentDungeon.isPass || false;
                const record = currentDungeon.bestRecord;
                
                // 去除後綴使名稱更清爽
                const displayName = currentDungeon.name.replace(/·苦難$/, '').replace(/·Agony$/, '');
                
                // 關卡名稱與通關日期時間戳
                drawText(ctx, lang, displayName, colX[0], rowCenterY - 11, 14, colors.textMain, 'left', 'bold');
                if (isPass && record?.ts) {
                    drawText(ctx, lang, formatTimestamp(record.ts), colX[0], rowCenterY + 12, 11, colors.textLight);
                } else {
                    drawText(ctx, lang, '-', colX[0], rowCenterY + 12, 11, colors.textLight);
                }

                // 最佳通關時間
                if (isPass && record?.passTs != null) {
                    drawText(ctx, lang, `⏱️ ${formatPassTime(record.passTs)}`, colX[1], rowCenterY, 13, colors.textMain, 'center', 'bold');
                } else {
                    drawText(ctx, lang, '-', colX[1], rowCenterY, 13, colors.textLight, 'center');
                }

                // 繪製通關的 4 個幹員頭像 (正方形圓角卡片展示，含屬性、等級、潛能)
                if (isPass && record && Array.isArray(record.chars)) {
                    const chars = record.chars.slice(0, 4);
                    const cardSize = 42;
                    const gap = 6;
                    const startX = colX[2];
                    
                    for (let cIdx = 0; cIdx < chars.length; cIdx++) {
                        const char = chars[cIdx];
                        const cardX = startX + cIdx * (cardSize + gap);
                        const cardY = rowCenterY - cardSize / 2;

                        // 1. 繪製正方形圓角卡片頭像
                        ctx.save();
                        ctx.fillStyle = '#2C3038';
                        drawRoundedRect(ctx, cardX, cardY, cardSize, cardSize, 4, true, false);
                        ctx.clip();

                        const avatarImg = await loadCachedImage(char.avatarUrl);
                        if (avatarImg) {
                            ctx.drawImage(avatarImg, cardX, cardY, cardSize, cardSize);
                        } else {
                            drawText(ctx, lang, '?', cardX + cardSize / 2, cardY + cardSize / 2, 14, '#FFFFFF', 'center', 'bold');
                        }
                        ctx.restore();

                        // 2. 繪製卡片底部稀有度色條 (使用官方 operatorEnums 配色)
                        const rarityVal = char.rarity?.value || char.rarity?.key?.replace('rarity_', '') || '4';
                        const rarityColor = RARITY_COLORS[rarityVal] || '#B0B0B5';
                        ctx.fillStyle = rarityColor;
                        ctx.fillRect(cardX, cardY + cardSize - 2.5, cardSize, 2.5);

                        // 3. 繪製左上角屬性圖標
                        if (char.property && char.property.key) {
                            await drawPropertyIcon(ctx, cardX + 2, cardY + 2, 11, char.property.key);
                        }

                        // 4. 繪製左下角等級黑條
                        if (char.level != null) {
                            ctx.fillStyle = 'rgba(17, 19, 26, 0.75)';
                            ctx.fillRect(cardX, cardY + cardSize - 12.5, 17, 10);
                            ctx.fillStyle = '#FFFFFF';
                            ctx.font = 'bold 8px sans-serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(char.level.toString(), cardX + 8.5, cardY + cardSize - 7.5);
                        }

                        // 5. 繪製右下角潛能圖示 (使用本地 Potential_{level}.png 圖片)
                        if (char.potentialLevel != null) {
                            const potentialVal = Number.parseInt(char.potentialLevel, 10);
                            const potImg = await getPotentialImage(potentialVal);
                            if (potImg) {
                                ctx.drawImage(potImg, cardX + cardSize - 11, cardY + cardSize - 14, 10, 10);
                            }
                        }
                    }
                } else {
                    drawText(ctx, lang, '-', colX[2], rowCenterY, 13, colors.textLight);
                }

                // 狀態標籤
                drawPassBadge(ctx, lang, isPass, colX[3], rowCenterY);
            } else {
                drawText(ctx, lang, '-', colX[0], rowCenterY, 13, colors.textLight);
                drawText(ctx, lang, '-', colX[1], rowCenterY, 13, colors.textLight, 'center');
                drawText(ctx, lang, '-', colX[2], rowCenterY, 13, colors.textLight);
                drawText(ctx, lang, '-', colX[3], rowCenterY, 13, colors.textLight, 'center');
            }
        } else {
            drawText(ctx, lang, '-', colX[0], rowCenterY, 13, colors.textLight);
            drawText(ctx, lang, '-', colX[1], rowCenterY, 13, colors.textLight, 'center');
            drawText(ctx, lang, '-', colX[2], rowCenterY, 13, colors.textLight);
            drawText(ctx, lang, '-', colX[3], rowCenterY, 13, colors.textLight, 'center');
        }

        if (index < maxRows - 1) {
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(tableX + 20, rowCenterY + (rowHeight / 2));
            ctx.lineTo(tableX + tableW - 20, rowCenterY + (rowHeight / 2));
            ctx.strokeStyle = colors.border;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // 6. 水印
    ctx.save();
    ctx.font = `bold 12px "${getFontFamily(lang)}"`;
    ctx.fillStyle = 'rgba(79, 79, 82, 0.4)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(getText(lang, 'bot_name', '終末地簽到小助手'), width - 20, height - 10);
    ctx.restore();

    return {
        buffer: canvas.toBuffer('image/png'),
        groupName
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monument')
        .setDescription('查詢影拓豐碑通關進度 / View Umbral Monument progress')
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

            const result = await getIndieHardDetail(user);

            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
                    .setDescription(result.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const indieHard = result.indieHard;

            if (!indieHard || !indieHard.indieHardGroups || indieHard.indieHardGroups.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'monument_no_data_title'))
                    .setDescription(t(lang, 'monument_no_data'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const payload = await buildMonumentPayload(indieHard, 0, 'normal', lang);
            const message = await interaction.editReply({
                embeds: [payload.embed],
                files: [payload.attachment],
                components: payload.components,
            });

            setMonumentState(message.id, {
                userId: interaction.user.id,
                lang,
                indieHard,
                currentIndex: payload.currentIndex,
                difficulty: 'normal'
            });
            refreshControlsTimer(message);
        } catch (error) {
            console.error('[monument]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'error_title'))
                .setDescription(t(lang, 'error_query'))
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
    
    async handleButton(interaction, action) {
        const state = monumentViewState.get(interaction.message.id);
        const lang = resolveInteractionLang(interaction, state?.lang);
        if (!state || state.expiresAt < Date.now()) {
            clearMonumentState(interaction.message.id);
            return interaction.reply({
                content: getMonumentInteractionText(lang, 'monument_panel_expired'),
                ephemeral: true
            });
        }
        if (interaction.user.id !== state.userId) {
            return interaction.reply({
                content: getMonumentInteractionText(lang, 'monument_panel_owner_only'),
                ephemeral: true
            });
        }

        let nextIndex = state.currentIndex;
        let nextDifficulty = state.difficulty || 'normal';

        if (action === 'prevGroup') {
            nextIndex = clampIndex(state.currentIndex - 1, state.indieHard.indieHardGroups.length);
        } else if (action === 'nextGroup') {
            nextIndex = clampIndex(state.currentIndex + 1, state.indieHard.indieHardGroups.length);
        } else if (action === 'toggleDifficulty') {
            nextDifficulty = state.difficulty === 'hard' ? 'normal' : 'hard';
        }

        const payload = await buildMonumentPayload(state.indieHard, nextIndex, nextDifficulty, state.lang);
        setMonumentState(interaction.message.id, {
            ...state,
            currentIndex: payload.currentIndex,
            difficulty: nextDifficulty
        });
        await interaction.update({
            embeds: [payload.embed],
            files: [payload.attachment],
            components: payload.components,
        });
        
        refreshControlsTimer(interaction.message);
    },
    
    async handleSelectMenu(interaction, action) {
        if (action !== 'selectGroup') return;

        const state = monumentViewState.get(interaction.message.id);
        const lang = resolveInteractionLang(interaction, state?.lang);
        if (!state || state.expiresAt < Date.now()) {
            clearMonumentState(interaction.message.id);
            return interaction.reply({
                content: getMonumentInteractionText(lang, 'monument_panel_expired'),
                ephemeral: true
            });
        }
        if (interaction.user.id !== state.userId) {
            return interaction.reply({
                content: getMonumentInteractionText(lang, 'monument_panel_owner_only'),
                ephemeral: true
            });
        }

        const selected = Number.parseInt(interaction.values?.[0], 10);
        if (!Number.isInteger(selected)) {
            return interaction.reply({
                content: getMonumentInteractionText(lang, 'monument_panel_invalid_option'),
                ephemeral: true
            });
        }

        const difficulty = state.difficulty || 'normal';
        const payload = await buildMonumentPayload(state.indieHard, selected, difficulty, state.lang);
        setMonumentState(interaction.message.id, {
            ...state,
            currentIndex: payload.currentIndex,
        });
        await interaction.update({
            embeds: [payload.embed],
            files: [payload.attachment],
            components: payload.components,
        });
        
        refreshControlsTimer(interaction.message);
    },
    _generateMonumentImage: generateMonumentImage,
};
