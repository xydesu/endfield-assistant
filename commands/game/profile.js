const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

// ==========================================
// 初始化：動態註冊多語言字體 (TC, SC, JP)
// ==========================================
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

// ==========================================
// 輔助繪圖函數與調色盤
// ==========================================
const colors = {
    bg: '#FFFFFF',
    grid: '#E5E5E8',
    panelBg: '#F1F1F4',
    border: '#D5D5D8',
    yellow: '#F4D216',
    yellowSub: '#B59E00',
    headerBg: '#E8E8E8',
    black: '#000000',
    textMain: '#101012',
    textSub: '#4F4F52',
    alert: '#d32f2f',
    progress_bg: '#DADADA',
    green: '#2ecc71',
    pass_accent: '#22252A',
    bracketLight: '#B0B0B5'
};

// 取得對應語言的字體系列
function getFontFamily(lang) {
    switch (lang) {
        case 'zh_Hans': return 'Noto Sans SC';
        case 'ja': return 'Noto Sans JP';
        case 'zh_Hant':
        case 'en':
        default: return 'Noto Sans TC';
    }
}

// 輔助翻譯函數：如果 i18n 找不到對應 key，就回傳預設的字串
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
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function drawTechBar(ctx, x, y, w, h, progress, max, color) {
    const slant = 10;
    drawPolygon(ctx, [
        { x: x, y: y }, { x: x + w, y: y },
        { x: x + w - slant, y: y + h }, { x: x - slant, y: y + h }
    ], colors.progress_bg);

    const safeMax = max > 0 ? max : 1;
    const fillWidth = (progress / safeMax) * w;

    if (fillWidth > 0) {
        drawPolygon(ctx, [
            { x: x, y: y }, { x: x + fillWidth, y: y },
            { x: x + fillWidth - slant, y: y + h }, { x: x - slant, y: y + h }
        ], color);
    }
}

function drawText(ctx, lang, text, x, y, size, color, align = 'left', weight = 'normal') {
    const font = getFontFamily(lang);
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "${font}"`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

function drawDecoratedTitle(ctx, lang, text, x, y, textSize, bracketSize, textColor, bracketColor) {
    const font = getFontFamily(lang);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${bracketSize}px "${font}"`;
    ctx.fillStyle = bracketColor;
    ctx.fillText('[  ', x, y - 1);
    const leftWidth = ctx.measureText('[  ').width;
    ctx.font = `bold ${textSize}px "${font}"`;
    ctx.fillStyle = textColor;
    ctx.fillText(text, x + leftWidth, y);
    const textWidth = ctx.measureText(text).width;
    ctx.font = `900 ${bracketSize}px "${font}"`;
    ctx.fillStyle = bracketColor;
    ctx.fillText('  ]', x + leftWidth + textWidth - 2, y - 1);
}

function drawDataRow(ctx, lang, label, value, x, y, w) {
    const font = getFontFamily(lang);
    drawText(ctx, lang, label, x, y, 14, colors.textSub, 'left', 'bold');
    drawText(ctx, lang, value.toString(), x + w, y, 18, colors.textMain, 'right', 'bold');
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    
    ctx.font = `bold 14px "${font}"`;
    const labelWidth = ctx.measureText(label).width;
    ctx.font = `bold 18px "${font}"`;
    const valWidth = ctx.measureText(value.toString()).width;
    
    ctx.moveTo(x + labelWidth + 15, y);
    ctx.lineTo(x + w - valWidth - 15, y);
    ctx.stroke();
    ctx.setLineDash([]);
}

// ==========================================
// 核心：生成個人資料圖片
// ==========================================
async function generateProfileImage(detail, user, lang) {
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const { base, bpSystem, dungeon, dailyMission, weeklyMission, achieve, domain, spaceShip } = detail;

    let totalTrchestCount = 0;
    let totalPuzzleCount = 0;
    if (domain && Array.isArray(domain)) {
        for (const d of domain) {
            if (d.collections && Array.isArray(d.collections)) {
                for (const c of d.collections) {
                    totalTrchestCount += (c.trchestCount || 0);
                    totalPuzzleCount += (c.puzzleCount || 0);
                }
            }
        }
    }

    // 1. 繪製背景與網格
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i < height; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke(); }
    for (let j = 0; j < width; j += 40) { ctx.beginPath(); ctx.moveTo(j, 0); ctx.lineTo(j, height); ctx.stroke(); }

    // 2. 左側：Rank
    drawPolygon(ctx, [{ x: 40, y: 40 }, { x: 320, y: 40 }, { x: 320, y: 110 }, { x: 300, y: 130 }, { x: 40, y: 130 }], colors.yellow);
    drawText(ctx, lang, getText(lang, 'img_level', '權限等階'), 55, 65, 14, colors.black, 'left', '900');
    drawText(ctx, lang, `${base.level || 0}`, 50, 100, 48, colors.black, 'left', '900'); 

    ctx.save();
    ctx.beginPath(); ctx.rect(220, 40, 100, 90); ctx.clip();
    ctx.strokeStyle = colors.black; ctx.lineWidth = 6;
    for (let i = 200; i < 350; i += 15) { ctx.beginPath(); ctx.moveTo(i, 40); ctx.lineTo(i - 40, 130); ctx.stroke(); }
    ctx.restore();

    // 3. 左側：玩家資訊
    drawPolygon(ctx, [{ x: 40, y: 140 }, { x: 320, y: 140 }, { x: 320, y: 340 }, { x: 40, y: 340 }], colors.panelBg, colors.border, 2);

    const avatarX = 60, avatarY = 160, avatarSize = 80;
    ctx.strokeStyle = colors.textSub; ctx.lineWidth = 2; ctx.strokeRect(avatarX, avatarY, avatarSize, avatarSize);

    let avatarImg;
    try {
        if (base.avatarUrl) avatarImg = await loadImage(base.avatarUrl); 
        else avatarImg = await loadImage(path.resolve(__dirname, '../../avatar.png')); 
    } catch (e) { console.error('頭像載入失敗', e); }

    if (avatarImg) {
        ctx.drawImage(avatarImg, avatarX + 4, avatarY + 4, avatarSize - 8, avatarSize - 8);
    } else {
        ctx.fillStyle = '#2c3038'; ctx.fillRect(avatarX + 4, avatarY + 4, avatarSize - 8, avatarSize - 8);
        drawText(ctx, lang, '?', avatarX + avatarSize / 2, avatarY + avatarSize / 2, 28, '#FFFFFF', 'center', '900');
    }

    let createDateStr = getText(lang, 'img_unknown', '未知');
    if (base.createTime) {
        const date = new Date(parseInt(base.createTime) * 1000);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        createDateStr = `${y}/${m}/${d}`;
    }

    drawText(ctx, lang, base.name || getText(lang, 'img_unknown_operator', '未知幹員'), 160, 180, 28, colors.textMain, 'left', 'bold');
    drawText(ctx, lang, `ID: ${user.uid || '—'}`, 160, 210, 12, colors.textSub);
    drawText(ctx, lang, `${base.serverName || 'Asia'} | ${getText(lang, 'img_explore_level', '探索等級')}: ${base.worldLevel || 1}`, 60, 270, 12, colors.textSub);
    drawText(ctx, lang, `${getText(lang, 'img_awaken_day', '甦醒日')}: ${createDateStr}`, 60, 290, 12, colors.textSub);

    // 4. 左側：理智 Sanity Core
    drawPolygon(ctx, [{ x: 40, y: 360 }, { x: 320, y: 360 }, { x: 320, y: 560 }, { x: 280, y: 560 }, { x: 40, y: 560 }], colors.panelBg, colors.border, 2);
    drawDecoratedTitle(ctx, lang, getText(lang, 'img_realtime_info', '即時資訊'), 60, 390, 13, 22, colors.textMain, colors.bracketLight);

    const curStamina = parseInt(dungeon.curStamina) || 0;
    const maxStamina = parseInt(dungeon.maxStamina) || 0;
    drawText(ctx, lang, `${curStamina}`, 60, 440, 64, colors.textMain, 'left', 'bold');
    drawText(ctx, lang, `/ ${maxStamina}`, 180, 450, 18, colors.textSub);

    let recoveryText = getText(lang, 'img_stamina_maxed', '已達上限');
    if (curStamina < maxStamina && dungeon.maxTs) {
        const secondsLeft = parseInt(dungeon.maxTs) - Math.floor(Date.now() / 1000);
        if (secondsLeft > 0) {
            const h = Math.floor(secondsLeft / 3600);
            const m = Math.floor((secondsLeft % 3600) / 60);
            recoveryText = `${getText(lang, 'img_recovery_time', '恢復時間')} : ${h}h ${m}m`;
        }
    }
    drawText(ctx, lang, recoveryText, 60, 510, 12, colors.textSub);
    drawTechBar(ctx, 60, 530, 220, 8, curStamina, maxStamina, colors.yellow);

    // 5. 中右側數據庫模組
    drawText(ctx, lang, '// ENDFIELD INDUSTRIES', 360, 60, 18, colors.textMain, 'left', '900');
    drawPolygon(ctx, [{ x: 360, y: 80 }, { x: 960, y: 80 }], null, colors.border, 2);

    const dataBoxY = 92;
    drawPolygon(ctx, [{ x: 360, y: dataBoxY }, { x: 960, y: dataBoxY }, { x: 960, y: 295 }, { x: 360, y: 295 }], colors.panelBg, colors.border, 2);
    drawPolygon(ctx, [{ x: 360, y: dataBoxY }, { x: 960, y: dataBoxY }, { x: 960, y: 120 }, { x: 360, y: 120 }], colors.headerBg);
    drawPolygon(ctx, [{ x: 660, y: dataBoxY }, { x: 660, y: 120 }], null, colors.border, 1);

    const leftX = 380, rightX = 680, listYStart = 145, listGap = 40;
    const controlCenterLevel = spaceShip?.rooms?.[0]?.level ?? '—';

    drawDecoratedTitle(ctx, lang, getText(lang, 'img_operator_weapon', '幹員與武裝'), leftX, 106, 12, 18, colors.textMain, '#C0C0C5');
    drawDataRow(ctx, lang, getText(lang, 'img_operator', '幹員'), base.charNum || 0, leftX, listYStart, 250);
    drawDataRow(ctx, lang, getText(lang, 'img_weapon', '武器'), base.weaponNum || 0, leftX, listYStart + listGap, 250);
    drawDataRow(ctx, lang, getText(lang, 'img_control_center', '總控中樞'), controlCenterLevel, leftX, listYStart + listGap * 2, 250);
    drawDataRow(ctx, lang, getText(lang, 'img_storage', '儲藏箱'), totalTrchestCount, leftX, listYStart + listGap * 3, 250); 

    drawDecoratedTitle(ctx, lang, getText(lang, 'img_explore_record', '探索與紀錄'), rightX, 106, 12, 18, colors.textMain, '#C0C0C5');
    drawDataRow(ctx, lang, getText(lang, 'img_explore_level', '探索等級'), base.worldLevel || 1, rightX, listYStart, 250);
    drawDataRow(ctx, lang, getText(lang, 'img_files', '檔案'), base.docNum || 0, rightX, listYStart + listGap, 250);
    drawDataRow(ctx, lang, getText(lang, 'img_achieve', '光榮之路'), achieve ? achieve.count : 0, rightX, listYStart + listGap * 2, 250);
    drawDataRow(ctx, lang, getText(lang, 'img_puzzle', '謎質'), totalPuzzleCount, rightX, listYStart + listGap * 3, 250); 

    // 6. 右下側：系統任務
    const taskBoxY = 360;
    drawPolygon(ctx, [{ x: 360, y: taskBoxY }, { x: 960, y: taskBoxY }, { x: 960, y: 560 }, { x: 360, y: 560 }], colors.panelBg, colors.border, 2);
    drawDecoratedTitle(ctx, lang, getText(lang, 'img_system_mission', '系統任務'), 380, taskBoxY + 30, 14, 24, colors.textMain, colors.bracketLight);

    const dailyAct = dailyMission ? dailyMission.dailyActivation : 0;
    const dailyMax = dailyMission ? dailyMission.maxDailyActivation : 100;
    const weeklyScore = weeklyMission ? weeklyMission.score : 0;
    const weeklyTotal = weeklyMission ? weeklyMission.total : 10;
    const bpCur = bpSystem ? bpSystem.curLevel : 0;
    const bpMax = bpSystem ? bpSystem.maxLevel : 60;

    const tasks = [
        { label: getText(lang, 'img_activity', '活躍度'), progress: dailyAct, max: dailyMax, color: colors.yellow },
        { label: getText(lang, 'img_weekly', '每周事務'), progress: weeklyScore, max: weeklyTotal, color: colors.green },
        { label: getText(lang, 'img_bp', '通行證'), progress: bpCur, max: bpMax, color: colors.pass_accent }
    ];

    tasks.forEach((task, index) => {
        const yPos = taskBoxY + 70 + (index * 45);
        drawText(ctx, lang, task.label, 380, yPos, 14, colors.textMain, 'left', 'bold');
        drawText(ctx, lang, `${task.progress} / ${task.max}`, 930, yPos, 14, colors.textMain, 'right', 'bold');
        drawTechBar(ctx, 600, yPos - 6, 250, 12, task.progress, task.max, task.color);
    });

    // 7. 水印
    ctx.save();
    ctx.font = `bold 12px "${getFontFamily(lang)}"`;
    ctx.fillStyle = 'rgba(79, 79, 82, 0.4)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(getText(lang, 'bot_name', '終末地簽到小助手'), width - 20, height - 10);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

// ==========================================
// Discord 指令執行模塊
// ==========================================
module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('查詢玩家個人資料 / View player profile')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        let lang = 'zh_Hant';
        try {
            const discordId = interaction.user.id;
            const user = await User.findByPk(discordId);
            lang = user?.language || 'zh_Hant';

            // 尚未綁定
            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_desc'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // 請求官方資料
            const result = await getCardDetail(user);

            // 查詢失敗處理
            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
                    .setDescription(result.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // 1. 產生 Canvas 圖片 Buffer，傳入 lang 讓繪圖支援多語言
            const imageBuffer = await generateProfileImage(result.detail, user, lang);

            // 2. 建立 Discord 附件
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'endfield_profile.png' });

            // 處理標題多語言 (若語言檔中有宣告則使用，否則退回預設)
            const authorName = typeof t(lang, 'profile_title') === 'function' 
                ? t(lang, 'profile_title')(result.detail.base.name) 
                : `${result.detail.base.name} 的數據報告`;

            // 3. 建立 Embed
            const embed = new EmbedBuilder()
                .setColor(0xF4D216) // 終末地黃色
                .setAuthor({
                    name: authorName,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setImage('attachment://endfield_profile.png') 
                .setFooter({ text: t(lang, 'bot_name'), iconURL: 'https://example.com/logo.png' })
                .setTimestamp();

            // 4. 同時發送 Embed 和 Files 附件
            await interaction.editReply({
                embeds: [embed],
                files: [attachment]
            });

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