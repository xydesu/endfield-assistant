const { registerFont, createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const { ELEMENT_ICONS, ELEMENT_COLORS, RARITY_COLORS, getProfessionIcons } = require('./operatorEnums');
const { t } = require('./i18n');

// ── 網格常數（與舊版 HTML 模板完全一致）──────────────────────────────
const COLS      = 6;
const CARD_W    = 96;
const IMAGE_H   = 120;
const NAME_H    = 26;
const WEAPON_H  = 36;
const LINE_H    = 4;
const GAP       = 8;
const PADDING   = 16;
const FOOTER_H  = 28;
const FOOTER_MT = 10;
const SCALE     = 2;

// ── 徽章常數 ─────────────────────────────────────────────────────────
const BADGE_SIZE   = 15;
const BADGE_RADIUS = 2;
const BADGE_GAP    = 2;

const SERVER_ID_TO_NAME = {
    '1': 'China Mainland',
    '57': 'China-tmp',
    '2': 'Asia',
    '3': 'Americas/Europe',
};

// ── 字型註冊（模組載入時執行一次）──────────────────────────────────
function registerLangFont(langCode, familyName) {
    const weights = [
        { file: `NotoSans${langCode}-Regular.ttf`, weight: 'normal' },
        { file: `NotoSans${langCode}-Bold.ttf`, weight: 'bold' },
        { file: `NotoSans${langCode}-Black.ttf`, weight: '900' },
    ];
    for (const { file, weight } of weights) {
        const fontPath = path.join(__dirname, '..', 'assets', 'font', file);
        if (fs.existsSync(fontPath)) {
            registerFont(fontPath, { family: familyName, weight });
        }
    }
}

try {
    registerLangFont('TC', 'Noto Sans TC');
    registerLangFont('SC', 'Noto Sans SC');
    registerLangFont('JP', 'Noto Sans JP');
} catch (err) {
    console.error('[operatorsCanvas] 載入字體時發生錯誤', err);
}

// ── 選擇字型家族 ─────────────────────────────────────────────────────
function pickFontFamily(lang) {
    switch (lang) {
        case 'zh_Hans': return 'Noto Sans SC';
        case 'ja':      return 'Noto Sans JP';
        default:        return 'Noto Sans TC';
    }
}

// ── 輔助：繪製圓角矩形路徑 ───────────────────────────────────────────
function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ── 輔助：安全載入圖片（支援快取，失敗不中斷流程）────────────────────
async function safeLoadImage(src, cacheMap) {
    if (!src) return null;
    if (cacheMap && cacheMap.has(src)) {
        return cacheMap.get(src);
    }
    const loadPromise = loadImage(src).catch(() => null);
    if (cacheMap) {
        cacheMap.set(src, loadPromise);
    }
    return loadPromise;
}

// ── 輔助：載入圖標並強制染成純白色（等價於 CSS brightness(0) invert(1)）──
async function loadWhiteIcon(src, cacheMap) {
    if (!src) return null;
    const cacheKey = `white:${src}`;
    if (cacheMap && cacheMap.has(cacheKey)) {
        return cacheMap.get(cacheKey);
    }

    const tintPromise = (async () => {
        const img = await safeLoadImage(src, cacheMap);
        if (!img) return null;

        const w = img.width || 64;
        const h = img.height || 64;
        const offCanvas = createCanvas(w, h);
        const offCtx = offCanvas.getContext('2d');

        // 1. 先繪製原始圖標
        offCtx.drawImage(img, 0, 0, w, h);
        // 2. 利用 source-in 保留原有 Alpha 透明度，並將顏色強制替換為純白
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, w, h);

        return offCanvas;
    })();

    if (cacheMap) {
        cacheMap.set(cacheKey, tintPromise);
    }
    return tintPromise;
}

// ── 輔助：繪製截斷文字（超出寬度加省略號）────────────────────────────
function drawTruncatedText(ctx, text, x, y, maxWidth) {
    if (maxWidth <= 0) return;
    const measured = ctx.measureText(text);
    if (measured.width <= maxWidth) {
        ctx.fillText(text, x, y);
        return;
    }
    const ellipsis = '…';
    let truncated = text;
    while (truncated.length > 0) {
        truncated = truncated.slice(0, -1);
        if (ctx.measureText(truncated + ellipsis).width <= maxWidth) {
            ctx.fillText(truncated + ellipsis, x, y);
            return;
        }
    }
    ctx.fillText(ellipsis, x, y);
}

// ── 主要渲染函式 ─────────────────────────────────────────────────────
/**
 * 以純 Node-Canvas 繪製全幹員名冊網格圖卡。
 * @param {Array} chars 幹員陣列
 * @param {Object} opts 選項：uid, serverId, botName, lang
 * @returns {Promise<Buffer>} PNG Buffer
 */
async function renderOperatorsCanvas(chars = [], { uid = '', serverId = '', botName = '終末地簽到小助手', lang = 'zh_Hant' } = {}) {
    const professionIcons = await getProfessionIcons();
    const fontFamily = pickFontFamily(lang);

    // 依等級由高至低、稀有度由高至低排序
    const sorted = [...chars].sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        const ra = parseInt(a.charData?.rarity?.value || '0', 10);
        const rb = parseInt(b.charData?.rarity?.value || '0', 10);
        return rb - ra;
    });

    // 計算畫布邏輯尺寸（保底至少 1 列避免空陣列時高度異常）
    const rows = Math.max(1, Math.ceil(sorted.length / COLS));
    const CARD_H = IMAGE_H + NAME_H + WEAPON_H + LINE_H;
    const logicW = COLS * CARD_W + (COLS - 1) * GAP + PADDING * 2;
    const logicH = rows * CARD_H + (rows - 1) * GAP + PADDING * 2 + FOOTER_MT + FOOTER_H;

    // 建立 2x 超取樣畫布
    const canvas = createCanvas(logicW * SCALE, logicH * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // 填充白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, logicW, logicH);

    // 單次渲染共用圖片快取
    const imgCache = new Map();

    // 預先批次載入所有需要的遠端圖片（職業與元素圖標使用 loadWhiteIcon 轉為純白）
    const imageLoadPromises = sorted.map(async (char) => {
        const avatarUrl = char.charData?.avatarRtUrl || '';
        const profKey = char.charData?.profession?.key || '';
        const elementKey = char.charData?.property?.key || char.charData?.skills?.[0]?.property?.key || '';
        const weaponIconUrl = char.weapon?.weaponData?.iconUrl || '';

        const [avatarImg, profImg, elemImg, weaponImg] = await Promise.all([
            safeLoadImage(avatarUrl, imgCache),
            loadWhiteIcon(professionIcons[profKey] || '', imgCache),
            loadWhiteIcon(ELEMENT_ICONS[elementKey] || '', imgCache),
            safeLoadImage(weaponIconUrl, imgCache),
        ]);

        return { char, avatarImg, profImg, elemImg, weaponImg, elementKey, profKey };
    });

    const cardDataList = await Promise.all(imageLoadPromises);

    // 逐張繪製卡片
    for (let i = 0; i < cardDataList.length; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const cardX = PADDING + col * (CARD_W + GAP);
        const cardY = PADDING + row * (CARD_H + GAP);

        const { char, avatarImg, profImg, elemImg, weaponImg, elementKey } = cardDataList[i];
        const name = char.charData?.name || '?';
        const level = char.level || 0;
        const rarity = char.charData?.rarity?.value || '4';
        const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS['3'];
        const elementBgColor = ELEMENT_COLORS[elementKey] || '#888888';
        const evolvePhase = char.evolvePhase || 0;
        const potentialLevel = char.potentialLevel || 0;
        const weaponData = char.weapon?.weaponData || {};
        const weaponName = weaponData.name || '';
        const weaponLevel = char.weapon?.level || 0;

        // ── 卡片外框與陰影 ──
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
        roundRectPath(ctx, cardX, cardY, CARD_W, CARD_H, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();

        // ── 卡片整體圓角裁切 ──
        ctx.save();
        roundRectPath(ctx, cardX, cardY, CARD_W, CARD_H, 3);
        ctx.clip();

        // ── 頭像區域 ──
        ctx.fillStyle = '#dadada';
        ctx.fillRect(cardX, cardY, CARD_W, IMAGE_H);
        if (avatarImg) {
            // 頭像 cover 模式：等比縮放填滿，置頂對齊
            const imgRatio = avatarImg.width / avatarImg.height;
            const areaRatio = CARD_W / IMAGE_H;
            let sx = 0, sy = 0, sw = avatarImg.width, sh = avatarImg.height;
            if (imgRatio > areaRatio) {
                sw = avatarImg.height * areaRatio;
                sx = (avatarImg.width - sw) / 2;
            } else {
                sh = avatarImg.width / areaRatio;
            }
            ctx.drawImage(avatarImg, sx, sy, sw, sh, cardX, cardY, CARD_W, IMAGE_H);
        }

        // ── 左上角職業徽章 ──
        const badgeX = cardX + 4;
        let badgeY = cardY + 4;
        if (profImg) {
            roundRectPath(ctx, badgeX, badgeY, BADGE_SIZE, BADGE_SIZE, BADGE_RADIUS);
            ctx.fillStyle = '#444444';
            ctx.fill();
            ctx.drawImage(profImg, badgeX + 1, badgeY + 1, BADGE_SIZE - 2, BADGE_SIZE - 2);
            badgeY += BADGE_SIZE + BADGE_GAP;
        }

        // ── 元素屬性徽章 ──
        if (elemImg) {
            roundRectPath(ctx, badgeX, badgeY, BADGE_SIZE, BADGE_SIZE, BADGE_RADIUS);
            ctx.fillStyle = elementBgColor;
            ctx.fill();
            ctx.drawImage(elemImg, badgeX + 1, badgeY + 1, BADGE_SIZE - 2, BADGE_SIZE - 2);
        }

        // ── 底部遮罩漸層 ──
        const gradY = cardY + IMAGE_H - 22;
        const grad = ctx.createLinearGradient(0, gradY, 0, cardY + IMAGE_H);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = grad;
        ctx.fillRect(cardX, gradY, CARD_W, 22);

        // ── 潛能標籤 ──
        const bottomY = cardY + IMAGE_H - 4;
        if (potentialLevel > 0) {
            const potText = `${t(lang, 'html_potential')}${potentialLevel}`;
            ctx.font = `bold 7px '${fontFamily}', Arial, sans-serif`;
            const potW = ctx.measureText(potText).width + 4;
            const potH = 10;
            const potX = cardX + 4;
            const potY = bottomY - potH;
            roundRectPath(ctx, potX, potY, potW, potH, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fill();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#ffd700';
            ctx.textBaseline = 'middle';
            ctx.fillText(potText, potX + 2, potY + potH / 2);
        }

        // ── 等級文字（右下角）──
        ctx.textBaseline = 'bottom';
        const lvPrefix = 'Lv.';
        const lvNum = String(level);
        ctx.font = `bold 9px '${fontFamily}', Arial, sans-serif`;
        const lvPrefixW = ctx.measureText(lvPrefix).width;
        ctx.font = `bold 13px '${fontFamily}', Arial, sans-serif`;
        const lvNumW = ctx.measureText(lvNum).width;
        const totalLvW = lvPrefixW + lvNumW;
        const lvX = cardX + CARD_W - 4 - totalLvW;
        const lvY = bottomY;

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 1;
        ctx.font = `bold 9px '${fontFamily}', Arial, sans-serif`;
        ctx.fillText(lvPrefix, lvX, lvY);
        ctx.font = `bold 13px '${fontFamily}', Arial, sans-serif`;
        ctx.fillText(lvNum, lvX + lvPrefixW, lvY);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // ── 名稱列 ──
        const nameY = cardY + IMAGE_H;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cardX, nameY, CARD_W, NAME_H);

        ctx.fillStyle = '#292929';
        ctx.font = `bold 10px '${fontFamily}', Arial, sans-serif`;
        ctx.textBaseline = 'middle';

        let nameMaxW = CARD_W - 12;
        // 突破階段標籤預留寬度
        let evolveTagW = 0;
        if (evolvePhase > 0) {
            const evolveText = `${t(lang, 'html_evolve')} ${evolvePhase}`;
            ctx.font = `bold 7px '${fontFamily}', Arial, sans-serif`;
            evolveTagW = ctx.measureText(evolveText).width + 6 + 4;
            nameMaxW -= evolveTagW;
        }

        ctx.font = `bold 10px '${fontFamily}', Arial, sans-serif`;
        ctx.fillStyle = '#292929';
        drawTruncatedText(ctx, name, cardX + 6, nameY + NAME_H / 2, nameMaxW);

        // 突破階段標籤
        if (evolvePhase > 0) {
            const evolveText = `${t(lang, 'html_evolve')} ${evolvePhase}`;
            ctx.font = `bold 7px '${fontFamily}', Arial, sans-serif`;
            const etW = ctx.measureText(evolveText).width + 6;
            const etH = 11;
            const etX = cardX + CARD_W - 6 - etW;
            const etY = nameY + (NAME_H - etH) / 2;
            roundRectPath(ctx, etX, etY, etW, etH, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(evolveText, etX + 3, etY + etH / 2);
        }

        // ── 武器列 ──
        const weaponY = nameY + NAME_H;
        if (weaponName) {
            // 分割線
            ctx.fillStyle = '#eeeeee';
            ctx.fillRect(cardX, weaponY, CARD_W, 1);

            ctx.fillStyle = '#f9f9f9';
            ctx.fillRect(cardX, weaponY + 1, CARD_W, WEAPON_H - 1);

            const weaponIconSize = 26;
            const weaponInfoMaxW = CARD_W - 12 - (weaponImg ? weaponIconSize + 4 : 0);

            // 武器名稱
            ctx.fillStyle = '#333333';
            ctx.font = `bold 8px '${fontFamily}', Arial, sans-serif`;
            ctx.textBaseline = 'top';
            drawTruncatedText(ctx, weaponName, cardX + 6, weaponY + 6, weaponInfoMaxW);

            // 武器等級
            ctx.fillStyle = '#999999';
            ctx.font = `normal 7px Verdana, sans-serif`;
            ctx.fillText(`Lv.${weaponLevel}`, cardX + 6, weaponY + 18);

            // 武器圖標
            if (weaponImg) {
                const wiX = cardX + CARD_W - 6 - weaponIconSize;
                const wiY = weaponY + (WEAPON_H - weaponIconSize) / 2;
                // 淺框底色
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(wiX, wiY, weaponIconSize, weaponIconSize);
                ctx.strokeStyle = '#f0f0f0';
                ctx.lineWidth = 1;
                ctx.strokeRect(wiX, wiY, weaponIconSize, weaponIconSize);
                ctx.drawImage(weaponImg, wiX, wiY, weaponIconSize, weaponIconSize);
            }
        } else {
            ctx.fillStyle = '#f9f9f9';
            ctx.fillRect(cardX, weaponY, CARD_W, WEAPON_H);
        }

        // ── 稀有度底色線 ──
        const lineY = weaponY + WEAPON_H;
        ctx.fillStyle = rarityColor;
        ctx.fillRect(cardX, lineY, CARD_W, LINE_H);

        ctx.restore(); // 結束卡片圓角裁切
    }

    // ── 頁腳 ──
    const footerTop = PADDING + rows * CARD_H + (rows - 1) * GAP + FOOTER_MT;
    // 分割線
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(PADDING, footerTop, logicW - PADDING * 2, 1);

    ctx.textBaseline = 'middle';
    const footerCenterY = footerTop + 6 + (FOOTER_H - 6) / 2;

    // 左側：UID + Server
    ctx.fillStyle = '#888888';
    ctx.font = `normal 9px '${fontFamily}', Arial, sans-serif`;
    let leftX = PADDING + 2;
    if (uid) {
        const uidText = `UID: ${uid}`;
        ctx.fillText(uidText, leftX, footerCenterY);
        leftX += ctx.measureText(uidText).width + 10;
    }
    const serverName = SERVER_ID_TO_NAME[serverId] || serverId || '';
    if (serverName) {
        ctx.fillText(`Server: ${serverName}`, leftX, footerCenterY);
    }

    // 右側：Bot 名稱
    ctx.fillStyle = '#aaaaaa';
    const botText = botName || '終末地簽到小助手';
    const botTextW = ctx.measureText(botText).width;
    ctx.fillText(botText, logicW - PADDING - 2 - botTextW, footerCenterY);

    return canvas.toBuffer('image/png');
}

module.exports = { renderOperatorsCanvas, COLS, CARD_W, IMAGE_H, NAME_H, WEAPON_H, LINE_H, GAP, PADDING };