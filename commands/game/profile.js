const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

// ==========================================
// 初始化：註冊本地字體 (Noto Sans TC)
// ==========================================
try {
    // 假設字體放在專案根目錄
    registerFont(path.resolve(__dirname, '../../assets/font/NotoSansTC-Regular.ttf'), { family: 'Noto Sans', weight: 'normal' });
    registerFont(path.resolve(__dirname, '../../assets/font/NotoSansTC-Bold.ttf'), { family: 'Noto Sans', weight: 'bold' });
    registerFont(path.resolve(__dirname, '../../assets/font/NotoSansTC-Black.ttf'), { family: 'Noto Sans', weight: '900' });
    console.log('[Canvas] ✅ 成功載入 Noto Sans 字體');
} catch (error) {
    console.error('[Canvas] ⚠️ 無法載入字體，將降級使用系統預設字體！', error.message);
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

    // 防呆：避免 max 為 0 導致無限大
    const safeMax = max > 0 ? max : 1;
    const fillWidth = (progress / safeMax) * w;

    if (fillWidth > 0) {
        drawPolygon(ctx, [
            { x: x, y: y }, { x: x + fillWidth, y: y },
            { x: x + fillWidth - slant, y: y + h }, { x: x - slant, y: y + h }
        ], color);
    }
}

function drawText(ctx, text, x, y, size, color, align = 'left', weight = 'normal', font = 'Noto Sans') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px "${font}"`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}

function drawDecoratedTitle(ctx, text, x, y, textSize, bracketSize, textColor, bracketColor) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${bracketSize}px "Noto Sans"`;
    ctx.fillStyle = bracketColor;
    ctx.fillText('[  ', x, y - 1);
    const leftWidth = ctx.measureText('[  ').width;
    ctx.font = `bold ${textSize}px "Noto Sans"`;
    ctx.fillStyle = textColor;
    ctx.fillText(text, x + leftWidth, y);
    const textWidth = ctx.measureText(text).width;
    ctx.font = `900 ${bracketSize}px "Noto Sans"`;
    ctx.fillStyle = bracketColor;
    ctx.fillText('  ]', x + leftWidth + textWidth - 2, y - 1);
}

function drawDataRow(ctx, label, value, x, y, w) {
    drawText(ctx, label, x, y, 14, colors.textSub, 'left', 'bold');
    drawText(ctx, value.toString(), x + w, y, 18, colors.textMain, 'right', 'bold');
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    const labelWidth = ctx.measureText(label).width;
    const valWidth = ctx.measureText(value.toString()).width;
    ctx.moveTo(x + labelWidth + 15, y);
    ctx.lineTo(x + w - valWidth - 15, y);
    ctx.stroke();
    ctx.setLineDash([]);
}

// ==========================================
// 核心：生成個人資料圖片
// ==========================================
async function generateProfileImage(detail, user) {
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const { base, bpSystem, dungeon, dailyMission, weeklyMission, achieve, domain, spaceShip } = detail;

    // 計算儲藏箱 (trchestCount) 與 謎質 (puzzleCount) 加總
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
    drawText(ctx, '權限等階', 55, 65, 14, colors.black, 'left', '900');
    drawText(ctx, `${base.level || 0}`, 50, 100, 48, colors.black, 'left', '900'); // 動態綁定等級

    ctx.save();
    ctx.beginPath(); ctx.rect(220, 40, 100, 90); ctx.clip();
    ctx.strokeStyle = colors.black; ctx.lineWidth = 6;
    for (let i = 200; i < 350; i += 15) { ctx.beginPath(); ctx.moveTo(i, 40); ctx.lineTo(i - 40, 130); ctx.stroke(); }
    ctx.restore();

    // 3. 左側：玩家資訊
    drawPolygon(ctx, [{ x: 40, y: 140 }, { x: 320, y: 140 }, { x: 320, y: 340 }, { x: 40, y: 340 }], colors.panelBg, colors.border, 2);

    // 載入頭像
    const avatarX = 60, avatarY = 160, avatarSize = 80;
    ctx.strokeStyle = colors.textSub; ctx.lineWidth = 2; ctx.strokeRect(avatarX, avatarY, avatarSize, avatarSize);

    let avatarImg;
    try {
        if (base.avatarUrl) avatarImg = await loadImage(base.avatarUrl); // 嘗試使用 API 傳回的頭像
        else avatarImg = await loadImage(path.resolve(__dirname, '../../avatar.png')); // 備用圖
    } catch (e) { console.error('頭像載入失敗', e); }

    if (avatarImg) {
        ctx.drawImage(avatarImg, avatarX + 4, avatarY + 4, avatarSize - 8, avatarSize - 8);
    } else {
        ctx.fillStyle = '#2c3038'; ctx.fillRect(avatarX + 4, avatarY + 4, avatarSize - 8, avatarSize - 8);
        drawText(ctx, '?', avatarX + avatarSize / 2, avatarY + avatarSize / 2, 28, '#FFFFFF', 'center', '900');
    }

    let createDateStr = '未知';
    if (base.createTime) {
        const date = new Date(parseInt(base.createTime) * 1000);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        createDateStr = `${y}/${m}/${d}`;
    }

    drawText(ctx, base.name || '未知幹員', 160, 180, 28, colors.textMain, 'left', 'bold');
    drawText(ctx, `ID: ${user.uid || '—'}`, 160, 210, 12, colors.textSub);
    drawText(ctx, `${base.serverName || 'Asia'} | 探索等級: ${base.worldLevel || 1}`, 60, 270, 12, colors.textSub);
    drawText(ctx, `甦醒日: ${createDateStr}`, 60, 290, 12, colors.textSub);

    // 4. 左側：理智 Sanity Core
    drawPolygon(ctx, [{ x: 40, y: 360 }, { x: 320, y: 360 }, { x: 320, y: 560 }, { x: 280, y: 560 }, { x: 40, y: 560 }], colors.panelBg, colors.border, 2);
    drawDecoratedTitle(ctx, '即時資訊', 60, 390, 13, 22, colors.textMain, colors.bracketLight);

    const curStamina = parseInt(dungeon.curStamina) || 0;
    const maxStamina = parseInt(dungeon.maxStamina) || 0;
    drawText(ctx, `${curStamina}`, 60, 440, 64, colors.textMain, 'left', 'bold');
    drawText(ctx, `/ ${maxStamina}`, 180, 450, 18, colors.textSub);

    // 恢復時間計算
    let recoveryText = '已達上限';
    if (curStamina < maxStamina && dungeon.maxTs) {
        const secondsLeft = parseInt(dungeon.maxTs) - Math.floor(Date.now() / 1000);
        if (secondsLeft > 0) {
            const h = Math.floor(secondsLeft / 3600);
            const m = Math.floor((secondsLeft % 3600) / 60);
            recoveryText = `恢復時間 : ${h}h ${m}m`;
        }
    }
    drawText(ctx, recoveryText, 60, 510, 12, colors.textSub);
    drawTechBar(ctx, 60, 530, 220, 8, curStamina, maxStamina, colors.yellow);


    // 5. 中右側數據庫模組
    drawText(ctx, '// ENDFIELD INDUSTRIES', 360, 60, 18, colors.textMain, 'left', '900');
    drawPolygon(ctx, [{ x: 360, y: 80 }, { x: 960, y: 80 }], null, colors.border, 2);

    const dataBoxY = 92;
    drawPolygon(ctx, [{ x: 360, y: dataBoxY }, { x: 960, y: dataBoxY }, { x: 960, y: 295 }, { x: 360, y: 295 }], colors.panelBg, colors.border, 2);
    drawPolygon(ctx, [{ x: 360, y: dataBoxY }, { x: 960, y: dataBoxY }, { x: 960, y: 120 }, { x: 360, y: 120 }], colors.headerBg);
    drawPolygon(ctx, [{ x: 660, y: dataBoxY }, { x: 660, y: 120 }], null, colors.border, 1);

    const leftX = 380, rightX = 680, listYStart = 145, listGap = 40;

    const controlCenterLevel = spaceShip?.rooms?.[0]?.level ?? '—';

    drawDecoratedTitle(ctx, '幹員與武裝', leftX, 106, 12, 18, colors.textMain, '#C0C0C5');
    drawDataRow(ctx, '幹員', base.charNum || 0, leftX, listYStart, 250);
    drawDataRow(ctx, '武器', base.weaponNum || 0, leftX, listYStart + listGap, 250);
    drawDataRow(ctx, '總控中樞', controlCenterLevel, leftX, listYStart + listGap * 2, 250);
    drawDataRow(ctx, '儲藏箱', totalTrchestCount, leftX, listYStart + listGap * 3, 250); // 動態加總

    drawDecoratedTitle(ctx, '探索與紀錄', rightX, 106, 12, 18, colors.textMain, '#C0C0C5');
    drawDataRow(ctx, '探索等級', base.worldLevel || 1, rightX, listYStart, 250);
    drawDataRow(ctx, '檔案', base.docNum || 0, rightX, listYStart + listGap, 250);
    drawDataRow(ctx, '光榮之路', achieve ? achieve.count : 0, rightX, listYStart + listGap * 2, 250);
    drawDataRow(ctx, '謎質', totalPuzzleCount, rightX, listYStart + listGap * 3, 250); // 替換為謎質並動態加總


    // 6. 右下側：系統任務
    const taskBoxY = 360;
    drawPolygon(ctx, [{ x: 360, y: taskBoxY }, { x: 960, y: taskBoxY }, { x: 960, y: 560 }, { x: 360, y: 560 }], colors.panelBg, colors.border, 2);
    drawDecoratedTitle(ctx, '系統任務', 380, taskBoxY + 30, 14, 24, colors.textMain, colors.bracketLight);

    const dailyAct = dailyMission ? dailyMission.dailyActivation : 0;
    const dailyMax = dailyMission ? dailyMission.maxDailyActivation : 100;
    const weeklyScore = weeklyMission ? weeklyMission.score : 0;
    const weeklyTotal = weeklyMission ? weeklyMission.total : 10;
    const bpCur = bpSystem ? bpSystem.curLevel : 0;
    const bpMax = bpSystem ? bpSystem.maxLevel : 60;

    const tasks = [
        { label: '活躍度', progress: dailyAct, max: dailyMax, color: colors.yellow },
        { label: '每周事務', progress: weeklyScore, max: weeklyTotal, color: colors.green },
        { label: '通行證', progress: bpCur, max: bpMax, color: colors.pass_accent }
    ];

    tasks.forEach((task, index) => {
        const yPos = taskBoxY + 70 + (index * 45);
        drawText(ctx, task.label, 380, yPos, 14, colors.textMain, 'left', 'bold');
        drawText(ctx, `${task.progress} / ${task.max}`, 930, yPos, 14, colors.textMain, 'right', 'bold');
        drawTechBar(ctx, 600, yPos - 6, 250, 12, task.progress, task.max, task.color);
    });

    // 7. 水印
    ctx.save();
    ctx.font = `bold 12px "Noto Sans"`;
    ctx.fillStyle = 'rgba(79, 79, 82, 0.4)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('終末地簽到小助手', width - 20, height - 10);
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

            // 1. 產生 Canvas 圖片 Buffer (假設函數名稱為 generateProfileImage)
            const imageBuffer = await generateProfileImage(result.detail, user);

            // 2. 建立 Discord 附件，並設定檔名
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'endfield_profile.png' });

            // 3. 建立 Embed 並將圖片設置為該附件
            const embed = new EmbedBuilder()
                .setColor(0xF4D216) // 終末地黃色
                .setAuthor({
                    name: `${result.detail.base.name} 的數據報告`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setImage('attachment://endfield_profile.png') // 這裡的名稱必須與附件名稱一致
                .setFooter({ text: '終末地簽到小助手', iconURL: 'https://example.com/logo.png' })
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