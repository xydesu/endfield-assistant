const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

// ─── 字體載入與設定 ──────────────────────────────────────────────────────────

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
            console.warn(`[Canvas] ⚠️ 找不到字體文件: ${file}，對應語言可能出現亂碼或缺字。`);
        }
    }
}

try {
    registerLangFont('TC', 'Noto Sans TC');
    registerLangFont('SC', 'Noto Sans SC');
    registerLangFont('JP', 'Noto Sans JP');
    console.log('[Canvas] ✅ 成功載入多語言 Noto Sans 字體');
} catch (error) {
    console.error('[Canvas] ⚠️ 載入字體時發生錯誤，將降級使用系統預設字體！', error.message);
}

function getFontFamily(lang) {
    switch (lang) {
        case 'zh_Hans': return 'Noto Sans SC';
        case 'ja': return 'Noto Sans JP';
        case 'zh_Hant':
        case 'en':
        default: return 'Noto Sans TC';
    }
}

// ─── 資源與設定值 ──────────────────────────────────────────────────────────

const CSS_URL = 'https://gist.githubusercontent.com/xydesu/afe894a747f76f66eb4a1379ae711800/raw/3dc55df02c3ee9682c9c8b53a52ba8f510b83655/style.css';
const CERTIFY_BADGE_URL = 'https://static.skport.com/skport-fe-static/skport-game-tools/images/certifyBg.135716.png';
const MEDAL_CARD_BG_URL = 'https://static.skport.com/skport-fe-static/skport-game-tools/images/medalCardBg.547da7.png';

const SERVER_ID_TO_NAME = {
    '1': 'China Mainland',
    '57': 'China-tmp',
    '2': 'Asia',
    '3': 'Americas/Europe',
};

const imageCache = new Map();
let cssContentCache = null;

// ─── 輔助函式與繪圖邏輯 ────────────────────────────────────────────────────────

function fetchBuffer(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' },
        };
        const req = https.request(options, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.end();
    });
}

async function fetchText(url) {
    return (await fetchBuffer(url)).toString('utf8');
}

async function getCssContent() {
    if (!cssContentCache) {
        try {
            cssContentCache = await fetchText(CSS_URL);
        } catch (e) {
            console.error('Failed to fetch CSS:', e);
        }
    }
    return cssContentCache;
}

// 動態從 CSS 中提取 class 對應的 background-image 網格資源
function extractUrlFromCss(css, className) {
    if (!css) return null;
    const regex = new RegExp(`\\.${className}[^{]*\\{[^}]*background-image:\\s*url\\(["\']?([^"\')]+)["\']?\\)`, 'i');
    const match = css.match(regex);
    return match ? match[1] : null;
}

async function getCanvasImage(url) {
    if (!url) return null;
    if (imageCache.has(url)) {
        return imageCache.get(url);
    }
    try {
        let img;
        if (url.startsWith('data:')) {
            img = await loadImage(url);
        } else {
            const buffer = await fetchBuffer(url);
            img = await loadImage(buffer);
        }
        imageCache.set(url, img);
        return img;
    } catch (error) {
        const displayUrl = url.length > 100 ? url.slice(0, 100) + '...' : url;
        console.error(`Failed to load image from URL: ${displayUrl}`, error);
        return null;
    }
}

function getEffectiveLevel(medal) {
    const initLevel = medal.achievementData.initLevel || 1;
    return initLevel + (medal.level || 1) - 1;
}

function getMedalIconUrl(medal) {
    if (!medal) return null;
    const data = medal.achievementData;
    if (medal.isPlated && data.platedIcon) return data.platedIcon;
    const effectiveLevel = getEffectiveLevel(medal);
    if (effectiveLevel >= 3 && data.reforge3Icon) return data.reforge3Icon;
    if (effectiveLevel >= 2 && data.reforge2Icon) return data.reforge2Icon;
    return data.initIcon || null;
}

function buildDisplayMedals(achieve) {
    const display = achieve.display || {};
    const medals = achieve.achieveMedals || [];
    const result = new Array(10).fill(null);

    for (let i = 1; i <= 10; i++) {
        const medalId = display[String(i)];
        if (!medalId) continue;
        const medal = medals.find((m) => m.achievementData.id === medalId);
        result[i - 1] = medal || null;
    }
    return result;
}

// 繪製圓角卡片邊界
function drawRoundedRect(ctx, x, y, width, height, radius) {
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
}

// 繪製尖頂虛線六角形（未放勳章時的空框）
function drawHexagon(ctx, cx, cy, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy - h / 4);
    ctx.lineTo(cx + w / 2, cy + h / 4);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy + h / 4);
    ctx.lineTo(cx - w / 2, cy - h / 4);
    ctx.closePath();
}

async function generateAchieveCanvas(achieve, { hideCertify = false, uid = '', serverId = '', botName = '終末地簽到小助手', lang = 'zh_Hant' } = {}) {
    const medals = achieve.achieveMedals || [];
    const darkCount = medals.filter((m) => getEffectiveLevel(m) === 1).length;
    const silverCount = medals.filter((m) => getEffectiveLevel(m) === 2).length;
    const goldCount = medals.filter((m) => getEffectiveLevel(m) >= 3).length;
    const totalCount = achieve.count ?? (darkCount + silverCount + goldCount);

    const displayMedals = buildDisplayMedals(achieve);

    // 載入 CSS 並提取動態主題圖資，若不成功則採用預設 CDN 資源
    const css = await getCssContent();
    const darkBulletUrl = extractUrlFromCss(css, 'jvwawu') || 'https://static.skport.com/skport-fe-static/skport-game-tools/images/medalLevel1.d7a0df.png';
    const silverBulletUrl = extractUrlFromCss(css, 'hLiFxM') || 'https://static.skport.com/skport-fe-static/skport-game-tools/images/medalLevel2.6687eb.png';
    const goldBulletUrl = extractUrlFromCss(css, 'kwGPST') || 'https://static.skport.com/skport-fe-static/skport-game-tools/images/medalLevel3.ffb564.png';
    const decorUrl = extractUrlFromCss(css, 'bYvpNg') || 'https://static.skport.com/skport-fe-static/skport-game-tools/images/decor.2c66d2.png';

    // 基礎尺寸 (一倍)
    const CANVAS_WIDTH = 750;
    const CARD_HEIGHT = 182;
    const FOOTER_HEIGHT = 48;
    const CANVAS_HEIGHT = CARD_HEIGHT + FOOTER_HEIGHT;

    // Retina 縮放因子 (3倍解析度，確保在各式螢幕上均極致清晰)
    const SCALE_FACTOR = 3;

    const canvas = createCanvas(CANVAS_WIDTH * SCALE_FACTOR, CANVAS_HEIGHT * SCALE_FACTOR);
    const ctx = canvas.getContext('2d');

    // 縮放繪圖上下文，後續所有繪圖座標維持 1 倍座標即可
    ctx.scale(SCALE_FACTOR, SCALE_FACTOR);

    // 1. 全域背景底色
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. 繪製主卡片背景 (圓角裁剪)
    const cardBgImg = await getCanvasImage(MEDAL_CARD_BG_URL);
    if (cardBgImg) {
        ctx.save();
        drawRoundedRect(ctx, 0, 0, CANVAS_WIDTH, CARD_HEIGHT, 23);
        ctx.clip();
        ctx.drawImage(cardBgImg, 0, 0, CANVAS_WIDTH, CARD_HEIGHT);
        ctx.restore();
    }

    // 3. 左半部：數據統計 (靠左對齊 & 深色主題)
    const leftAlignX = 36;
    const currentFontFamily = getFontFamily(lang);

    // 總收集數
    ctx.fillStyle = '#2d2f33';
    ctx.font = `bold 48px "${currentFontFamily}", Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(totalCount), leftAlignX, 56);

    // 總收集數標題
    ctx.fillStyle = '#5c5e62';
    ctx.font = `26px "${currentFontFamily}", Arial, sans-serif`;
    ctx.fillText(t(lang, 'html_achieve_total') || '總收集數', leftAlignX, 96);

    // 小裝飾標誌 (稍微下拉至 Y=112 避免與日文等大字型重疊)
    const decorImg = await getCanvasImage(decorUrl);
    if (decorImg) {
        ctx.drawImage(decorImg, leftAlignX, 100, 69/2, 27/2);
    }

    // 銅、銀、金分類計數
    const tiers = [
        { url: darkBulletUrl, count: darkCount },
        { url: silverBulletUrl, count: silverCount },
        { url: goldBulletUrl, count: goldCount }
    ];

    for (let idx = 0; idx < tiers.length; idx++) {
        const tier = tiers[idx];
        const startX = leftAlignX + idx * 72; // 平均橫向間距 72px

        const medalTierImg = await getCanvasImage(tier.url);
        if (medalTierImg) {
            ctx.drawImage(medalTierImg, startX, 138, 24, 24);
        }

        ctx.fillStyle = '#2d2f33';
        ctx.font = `bold 18px "${currentFontFamily}", Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(tier.count), startX + 30, 150);
    }

    // 4. 右半部：無縫幾何嵌套尖頂六角網格
    // 嚴格採用標誌性的尖頂六邊形黃金寬高比：W=92, H=106
    // 水平步進 STEP_X=76 (水平僅有微幅 16px 重疊，解決重合問題)
    // 垂直步進 Y2-Y1=66 (下排向上嵌套深入 40px，完全消除上下白色背景空隙)
    const MEDAL_W = 92;
    const MEDAL_H = 92;
    const gridStartX = 280; 
    const STEP_X = 76;
    const Y1 = 52;  // 上排 Y 軸中心
    const Y2 = 118; // 下排 Y 軸中心

    // Z-Index 順序：下排先畫（5~9），上排後畫（0~4），確保上排底角覆蓋在下排之上
    const drawOrder = [5, 6, 7, 8, 9, 0, 1, 2, 3, 4];

    for (const slotIdx of drawOrder) {
        let cx, cy;
        let medalIdx;

        if (slotIdx < 5) {
            // 上排 (0, 1, 2, 3, 4) 對應位置 1, 3, 5, 7, 9 -> 陣列索引 0, 2, 4, 6, 8
            cx = gridStartX + MEDAL_W / 2 + slotIdx * STEP_X;
            cy = Y1;
            medalIdx = slotIdx * 2;
        } else {
            // 下排 (5, 6, 7, 8, 9) 對應位置 2, 4, 6, 8, 10 -> 陣列索引 1, 3, 5, 7, 9
            const col = slotIdx - 5;
            cx = gridStartX + MEDAL_W / 2 + STEP_X / 2 + col * STEP_X;
            cy = Y2;
            medalIdx = col * 2 + 1;
        }

        const slotX = cx - MEDAL_W / 2;
        const slotY = cy - MEDAL_H / 2;

        const medal = displayMedals[medalIdx];
        const iconUrl = getMedalIconUrl(medal);

        if (iconUrl) {
            const medalImg = await getCanvasImage(iconUrl);
            if (medalImg) {
                ctx.drawImage(medalImg, slotX, slotY, MEDAL_W, MEDAL_H);
            }

            // 繪製認證標章 (精準覆蓋於六角形最頂點)
            const hasCertify = !!medal?.achievementData?.canCertify;
            if (!hideCertify && hasCertify) {
                const certifyImg = await getCanvasImage(CERTIFY_BADGE_URL);
                if (certifyImg) {
                    const badgeW = 30;
                    const badgeH = 30;
                    const badgeX = cx - badgeW / 2;
                    const badgeY = slotY + 2;
                    ctx.drawImage(certifyImg, badgeX, badgeY, badgeW, badgeH);
                }
            }
        } else {
            // 繪製虛線底框
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            drawHexagon(ctx, cx, cy, MEDAL_W, MEDAL_H);
            ctx.stroke();
            ctx.restore();
        }
    }

    // 5. 底部文字 (Footer)
    ctx.fillStyle = '#888888';
    ctx.font = `12px "${currentFontFamily}", Arial, sans-serif`;
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'left';
    let footerLeftText = '';
    if (uid) footerLeftText += `UID: ${uid}`;
    const serverName = SERVER_ID_TO_NAME[serverId] || serverId;
    if (serverName) {
        footerLeftText += (footerLeftText ? '   ' : '') + `Server: ${serverName}`;
    }
    ctx.fillText(footerLeftText, 20, CARD_HEIGHT + FOOTER_HEIGHT / 2);

    ctx.textAlign = 'right';
    ctx.fillText(botName, CANVAS_WIDTH - 20, CARD_HEIGHT + FOOTER_HEIGHT / 2);

    return canvas.toBuffer('image/png');
}

// ─── Discord 指令 ──────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('achieve')
        .setDescription('查詢光榮之路成就展示 / View Glory Road achievements')
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

            const { base, achieve } = result.detail;

            if (!achieve) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'achieve_no_data_title'))
                    .setDescription(t(lang, 'achieve_no_data_desc'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // 直接呼叫 Canvas 繪圖邏輯
            const imageBuffer = await generateAchieveCanvas(achieve, {
                hideCertify: false,
                uid: user.uid,
                serverId: user.serverId,
                botName: t(lang, 'bot_name'),
                lang
            });

            const attachment = new AttachmentBuilder(imageBuffer, { name: 'achieve.png' });
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'achieve_title')(base?.name ?? interaction.user.username))
                .setImage('attachment://achieve.png')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], files: [attachment] });

        } catch (error) {
            const { replyWithError } = require('../../utils/errorHelper');
            await replyWithError(interaction, error, lang);
        }
    },
};