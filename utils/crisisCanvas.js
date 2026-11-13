const { createCanvas } = require('canvas');
const path = require('path');
const { ensureFontsRegistered, applyLangFont } = require('./fonts');
const { loadCachedImage } = require('./httpCache');

ensureFontsRegistered();

const RARITY_COLORS = {
    '6': 'rgba(255,113,0,1)',    // dark_rank_orange
    '5': 'rgba(255,204,0,1)',    // dark_rank_yellow
    '4': 'rgba(179,128,255,1)',  // dark_rank_purple
    '3': 'rgba(51,194,255,1)',   // dark_rank_blue
    '2': 'rgba(180,217,69,1)',   // dark_rank_green
    '1': 'rgba(178,178,178,1)',  // dark_rank_gray
};

// 裝備卡槽錯位底塊高飽和度對應色表
const EQUIP_BLOCK_RARITY_COLORS = {
    '6': '#FF6F00',
    '5': '#E6A800',
    '4': '#9E6BFF',
    '3': '#29B6F6',
    '2': '#9CCC65',
    '1': '#9E9E9E',
};

const SERVER_ID_TO_NAME = {
    '1': 'China Mainland',
    '57': 'China Mainland',
    '2': 'Asia',
    '3': 'Americas/Europe',
};

// 輔助函式：建立圓角矩形路徑（可獨立指定左側圓角半徑，設 0 則僅右側保留圓角）
function traceRoundedRectPath(ctx, x, y, width, height, radius, leftRadius = radius) {
    ctx.beginPath();
    ctx.moveTo(x + leftRadius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + leftRadius, y + height);
    if (leftRadius > 0) {
        ctx.quadraticCurveTo(x, y + height, x, y + height - leftRadius);
        ctx.lineTo(x, y + leftRadius);
        ctx.quadraticCurveTo(x, y, x + leftRadius, y);
    } else {
        ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// 輔助函式：繪製圓角矩形
function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle, strokeWidth, leftRadius = radius) {
    traceRoundedRectPath(ctx, x, y, width, height, radius, leftRadius);
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = strokeWidth || 1;
        ctx.stroke();
    }
}

// 輔助函式：畫平行四邊形/斜體區塊
function drawSkewedRect(ctx, x, y, width, height, skewX, fillStyle) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + skewX, y);
    ctx.lineTo(x + width + skewX, y);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    ctx.restore();
}

const UI_TEXT = {
    zh_Hant: {
        totalIndicators: '指標總計',
        battleDuration: '戰鬥時長',
        actionDuration: '行動時長',
        indicatorList: '指標一覽',
        actionSuccess: '行動成功',
        actionFail: '行動中斷',
        sanctumRating: '聖所已予以您的評喻',
        assistant: '終末地簽到小助手',
    },
    zh_Hans: {
        totalIndicators: '指标总计',
        battleDuration: '战斗时长',
        actionDuration: '行动时长',
        indicatorList: '指标一览',
        actionSuccess: '行动成功',
        actionFail: '行动中断',
        sanctumRating: '圣所已予以您的评喻',
        assistant: '终末地签到小助手',
    },
    ja: {
        totalIndicators: '合計指標',
        battleDuration: '作戦時間',
        actionDuration: '行動時間',
        indicatorList: '指標一覧',
        actionSuccess: '行動成功',
        actionFail: '行動中断',
        sanctumRating: '聖所からの評価',
        assistant: 'エンドフィールドサインインアシスタント',
    },
    en: {
        totalIndicators: 'Total Indicators',
        battleDuration: 'Time Elapsed',
        actionDuration: 'Time Elapsed',
        indicatorList: 'Indicators',
        actionSuccess: 'OPERATION SUCCESS',
        actionFail: 'OPERATION INTERRUPTED',
        sanctumRating: 'Sanctum Assessment',
        assistant: 'Endfield Assistant',
    }
};

/**
 * 安全載入本地或遠端圖片（具有限 LRU 快取、逾時與大小上限），失敗時回傳 null
 */
function safeLoadImage(source) {
    return loadCachedImage(source);
}

/**
 * 將單色透明圖示重新著色為指定顏色，確保在深色背景上的可視性
 */
function tintIcon(img, color, size) {
    const off = createCanvas(size, size);
    const octx = off.getContext('2d');
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    octx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    octx.globalCompositeOperation = 'source-in';
    octx.fillStyle = color;
    octx.fillRect(0, 0, size, size);
    return off;
}

/**
 * 格式化秒數為 mm:ss
 */
function formatDuration(rawSeconds) {
    const num = Number(rawSeconds);
    if (!Number.isFinite(num) || num < 0) return '00:00';
    const total = Math.floor(num);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

/**
 * 判斷目前合約屬於 Phase 1（重燃測試）或 Phase 2+（浸藍測試作戰等新版結算畫面）
 */
function detectCrisisPhase(baseData, recordData, contractName = '', options = {}) {
    const originalId = options.originalId || baseData?.data?.crisisContract?.dungeon?.originalId || '';
    const recordId = recordData?.data?.recordDetail?.id || baseData?.data?.crisisContract?.history?.bestRecord?.id || '';

    if (/^indie_contract001\b/i.test(originalId) || /^indie_contract001\b/i.test(recordId)) {
        return 1;
    }
    if (/^indie_contract00[2-9]|^indie_contract0[1-9]\d/i.test(originalId) || /^indie_contract00[2-9]|^indie_contract0[1-9]\d/i.test(recordId)) {
        return 2;
    }
    if (typeof contractName === 'string' && /重燃測試|重燃测试|Reignite/i.test(contractName)) {
        return 1;
    }
    return 2;
}

/**
 * 依幹員、武器或裝備稀有度鍵值取得對應色條顏色
 */
function getRarityColor(obj, fallback = 'rgba(255,255,255,0.2)', palette = RARITY_COLORS) {
    if (obj?.rarity?.key) {
        const match = obj.rarity.key.match(/\d+/);
        if (match && palette[match[0]]) {
            return palette[match[0]];
        }
    }
    return fallback;
}

/**
 * Phase 2 評喻顏色（對應森空島官方等級區間）
 */
function getPhase2RatingColors(isPass, indicatorCount) {
    if (!isPass) {
        return { start: '#b34b33', end: '#8f3924' };
    }
    if (indicatorCount >= 30) {
        return { start: '#f471e6', end: '#f83f4d' };
    }
    if (indicatorCount >= 20) {
        return { start: '#815ff2', end: '#cd54f9' };
    }
    return { start: '#4379f5', end: '#9e93f3' };
}

/**
 * 根據 Crisis Contract 資料產生圖片 Buffer（自動依期數切換 Phase 1 / Phase 2 風格）
 */
async function drawCrisisUI(baseData, recordData, uid, serverId, contractName = '危機合約', lang = 'zh_Hant', options = {}) {
    const phase = detectCrisisPhase(baseData, recordData, contractName, options);
    if (phase === 1) {
        return drawPhase1CrisisUI(baseData, recordData, uid, serverId, contractName, lang);
    }
    return drawPhase2CrisisUI(baseData, recordData, uid, serverId, contractName, lang, options);
}

/**
 * 繪製 Phase 1（重燃測試）紅黑風格結算圖卡
 */
async function drawPhase1CrisisUI(baseData, recordData, uid, serverId, contractName = '危機合約', lang = 'zh_Hant') {
    const WIDTH = 1920;
    const HEIGHT = 1080;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    applyLangFont(ctx, lang);
    const text = UI_TEXT[lang] || UI_TEXT.zh_Hant;

    const bestRecordBase = baseData?.data?.crisisContract?.history?.bestRecord || {};
    const recordDetail = recordData?.data?.recordDetail || {};

    const charsData = Array.isArray(recordDetail.chars) ? recordDetail.chars : [];
    const indicators = Array.isArray(recordDetail.indicators) ? recordDetail.indicators : [];
    const indicatorIds = Array.isArray(recordDetail.indicatorIds) ? recordDetail.indicatorIds : null;
    const indicatorCount = recordDetail.indicatorCount ?? bestRecordBase.indicatorCount ?? 0;

    const timeStr = formatDuration(recordDetail.passTs ?? bestRecordBase.passTs ?? 0);

    const talentIconImg = await safeLoadImage(path.join(__dirname, '../assets/images/talent/1.png'));
    const indTotalImg = await safeLoadImage(path.join(__dirname, '../assets/images/ui/indicator_total.png'));
    const waveBgImg = await safeLoadImage(path.join(__dirname, '../assets/images/ui/wave_bg.png'));

    const waveNumImgs = await Promise.all([1, 2, 3, 4].map(i =>
        safeLoadImage(path.join(__dirname, `../assets/images/ui/wave_${i}.png`))
    ));
    const equipRefineImgs = await Promise.all([1, 2, 3].map(i =>
        safeLoadImage(path.join(__dirname, `../assets/images/ui/equip_refine_${i}.png`))
    ));

    // 1. 背景繪製
    const bgImg = await safeLoadImage(path.join(__dirname, '../assets/images/ui/successBg.832099.png'));

    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, WIDTH, HEIGHT);
    } else {
        ctx.fillStyle = '#1c1c24';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    
    // 深紅色漸層遮罩
    let redGradient = ctx.createLinearGradient(0, 0, WIDTH * 0.7, 0);
    redGradient.addColorStop(0, 'rgba(211, 47, 47, 0.4)');
    redGradient.addColorStop(0.5, 'rgba(211, 47, 47, 0.1)');
    redGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = redGradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // 整體黑色漸層壓暗底部與頂部
    let darkGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    darkGradient.addColorStop(0, 'rgba(0,0,0,0.5)');
    darkGradient.addColorStop(0.3, 'rgba(0,0,0,0)');
    darkGradient.addColorStop(0.7, 'rgba(0,0,0,0)');
    darkGradient.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = darkGradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // 3. 左上角標題區塊
    const titleX = 80;
    
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 65px 'Noto Sans TC', sans-serif";
    ctx.fillText(`${contractName}`, titleX, 160);

    const waveY = 110;
    const waveXStart = 750;
    for (let i = 0; i < 4; i++) {
        let wx = waveXStart + i * 50;
        
        if (waveBgImg) {
            ctx.drawImage(waveBgImg, wx, waveY + 10, 45, 45);
        } else {
            ctx.fillStyle = '#d32f2f';
            ctx.fillRect(wx, waveY, 40, 50);
            ctx.beginPath();
            ctx.moveTo(wx, waveY + 50);
            ctx.lineTo(wx + 20, waveY + 65);
            ctx.lineTo(wx + 40, waveY + 50);
            ctx.lineTo(wx, waveY + 50);
            ctx.fill();
        }
        
        if (waveNumImgs[i]) {
            ctx.drawImage(waveNumImgs[i], wx, waveY + 10, 45, 45);
        } else {
            const roms = ['I', 'II', 'III', 'IV'];
            ctx.fillStyle = '#ffffff';
            ctx.font = "bold 14px 'Noto Sans TC', sans-serif";
            ctx.fillText(roms[i], wx + 15, waveY + 45);
        }
    }

    // 4. 左側合約指標區塊 (Indicator Grid)
    const panelX = 80;
    const panelY = 250;
    
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(panelX, panelY, 560, 100);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 24px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.totalIndicators, panelX + 20, panelY + 35);
    
    if (indTotalImg) {
        ctx.drawImage(indTotalImg, panelX + 20, panelY + 40, 50, 50);
    } else {
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(panelX + 40, panelY + 60);
        ctx.lineTo(panelX + 60, panelY + 40);
        ctx.lineTo(panelX + 80, panelY + 60);
        ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 90px 'Noto Sans TC', sans-serif";
    ctx.textAlign = 'right';
    ctx.fillText(indicatorCount.toString(), panelX + 540, panelY + 85);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(panelX + 560, panelY, 300, 100);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = "18px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.battleDuration, panelX + 580, panelY + 30);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = "50px 'Noto Sans TC', sans-serif";
    ctx.fillText(timeStr, panelX + 710, panelY + 75);

    // (C) 指標網格
    const gridY = panelY + 100;
    const gridW = 860;
    const gridH = 320;
    ctx.fillStyle = 'rgba(20, 20, 20, 0.8)';
    ctx.fillRect(panelX, gridY, gridW, gridH);

    const cellW = 80;
    const cellH = 80;
    const gap = 15;
    const padX = 80;
    const padY = 30;

    const selectedIndicators = indicatorIds
        ? indicators.filter(ind => indicatorIds.includes(ind.id))
        : indicators;
    
    for (let i = 0; i < selectedIndicators.length; i++) {
        if (i >= 21) break; 
        
        let col = i % 7;
        let row = Math.floor(i / 7);
        let x = panelX + padX + col * (cellW + gap);
        let y = gridY + padY + row * (cellH + gap);

        const ind = selectedIndicators[i];

        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(x, y, cellW, cellH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellW, cellH);

        let iconImg = null;
        if (ind.icon) {
            iconImg = await safeLoadImage(ind.icon);
        }

        if (iconImg) {
            let iW = iconImg.width;
            let iH = iconImg.height;
            const maxISize = cellW - 10;
            const iScale = Math.min(maxISize / iW, maxISize / iH);
            iW = iW * iScale;
            iH = iH * iScale;
            const ix = x + 5 + (maxISize - iW) / 2;
            const iy = y + 5 + (maxISize - iH) / 2;
            ctx.drawImage(iconImg, ix, iy, iW, iH);
        } else {
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x + cellW/2, y + cellH/2, 20, 0, Math.PI * 2);
            ctx.stroke();
        }

        const scoreRom = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = "bold 12px 'Noto Sans TC', sans-serif";
        ctx.fillText(scoreRom[ind.score] || '', x + cellW - 20, y + cellH - 10);
    }

    // 5. 右側：幹員卡片高精度渲染
    const charStartX = 980;
    const charY = 80;
    const charW = 210;
    const charH = 820;
    const charGap = 15;

    for (let i = 0; i < 4; i++) {
        let cx = charStartX + i * (charW + charGap);

        drawRoundedRect(ctx, cx, charY, charW, charH, 2, 'rgba(15, 16, 20, 0.8)', 'rgba(255,255,255,0.05)', 1);

        const charObj = charsData[i];
        if (!charObj) continue;

        // (A) 半身立繪區域
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx, charY, charW, 420);
        ctx.clip();

        let avatarImg = null;
        if (charObj.avatarUrl) {
            avatarImg = await safeLoadImage(charObj.avatarUrl);
        }
        if (avatarImg) {
            ctx.drawImage(avatarImg, cx - 50, charY + 20, 310, 400);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(cx, charY, charW, 420);
        }
        ctx.restore();

        // 立繪過渡漸層
        let fadeGrad = ctx.createLinearGradient(cx, charY + 300, cx, charY + 450);
        fadeGrad.addColorStop(0, 'rgba(15,16,20,0)');
        fadeGrad.addColorStop(1, 'rgba(15,16,20,1)');
        ctx.fillStyle = fadeGrad;
        ctx.fillRect(cx, charY + 300, charW, 150);

        // 等級顯示
        ctx.fillStyle = '#ffffff';
        ctx.font = "bold 16px 'Noto Sans TC', sans-serif";
        ctx.fillText('Lv.', cx + 15, charY + 400);
        
        ctx.font = "bold 65px 'Noto Sans TC', sans-serif";
        ctx.fillText(charObj.level.toString(), cx + 15, charY + 460);

        // (B) 武器區域
        const weaponY = charY + 480;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(cx, weaponY, charW, 110);

        if (charObj.weapon) {
            const rLevel = charObj.weapon.refineLevel ?? 0;
            const potentialImgPath = path.join(__dirname, '../assets/images/character', `potential_${rLevel}.png`);
            const pImg = await safeLoadImage(potentialImgPath);
            if (pImg) {
                ctx.drawImage(pImg, cx + 5, weaponY + 10, 45, 45);
            }

            const wIconImg = charObj.weapon.icon ? await safeLoadImage(charObj.weapon.icon) : null;
            if (wIconImg) {
                let wW = wIconImg.width;
                let wH = wIconImg.height;
                const maxW = 100;
                const maxH = 80;
                const wScale = Math.min(maxW / wW, maxH / wH);
                wW = wW * wScale;
                wH = wH * wScale;
                const drawX = cx + charW - 60 - wW;
                const drawY = weaponY + 15 + (maxH - wH) / 2;
                ctx.drawImage(wIconImg, drawX, drawY, wW, wH);
            }

            ctx.fillStyle = '#ffffff';
            ctx.font = "bold 14px 'Noto Sans TC', sans-serif";
            ctx.fillText('Lv.', cx + 10, weaponY + 90);
            ctx.font = "bold 32px 'Noto Sans TC', sans-serif";
            const wLevel = charObj.weapon.level ?? 1;
            ctx.fillText(wLevel.toString(), cx + 32, weaponY + 90);

            ctx.fillStyle = getRarityColor(charObj.weapon, '#ffb300');
            ctx.fillRect(cx + 10, weaponY + 100, 70, 4);

            if (Array.isArray(charObj.weapon.weaponTerms)) {
                const terms = charObj.weapon.weaponTerms;
                for (let t = 0; t < terms.length; t++) {
                    let tw = 50;
                    let th = 22;
                    let tx = cx + charW - tw - 10;
                    let ty = weaponY + 12 + t * 28;

                    drawSkewedRect(ctx, tx, ty, tw, th, -5, 'rgba(255, 255, 255, 0.15)');

                    if (talentIconImg) {
                        ctx.drawImage(talentIconImg, tx - 16, ty + 3, 45, 15);
                    }

                    ctx.fillStyle = '#ffffff';
                    ctx.font = "bold 15px 'Noto Sans TC', sans-serif";
                    ctx.textAlign = 'right';
                    ctx.fillText(terms[t].toString(), tx + tw - 14, ty + 16);
                    ctx.textAlign = 'left';
                }
            }
        }

        // (C) 裝備槽區域 2x2
        const equipY = weaponY + 120;
        const eqSize = 90;
        const eqGapX = 10;
        const eqGapY = 10;
        
        const eqKeys = ['bodyEquip', 'armEquip', 'firstAccessory', 'secondAccessory'];
        
        for (let eqCol = 0; eqCol < 2; eqCol++) {
            for (let eqRow = 0; eqRow < 2; eqRow++) {
                let eqIdx = eqRow * 2 + eqCol;
                let eqKey = eqKeys[eqIdx];
                let eqObj = charObj.equips ? charObj.equips[eqKey] : null;
                
                let eqx = cx + 10 + eqCol * (eqSize + eqGapX);
                let eqy = equipY + eqRow * (eqSize + eqGapY);
                
                ctx.strokeStyle = 'rgba(0, 150, 255, 0.4)'; 
                ctx.lineWidth = 1.5;
                ctx.strokeRect(eqx, eqy, eqSize, eqSize);
                
                if (eqObj) {
                    if (eqObj.icon) {
                        const eqImg = await safeLoadImage(eqObj.icon);
                        if (eqImg) {
                            let eW = eqImg.width;
                            let eH = eqImg.height;
                            const maxEqSize = eqSize - 10;
                            const eScale = Math.min(maxEqSize / eW, maxEqSize / eH);
                            eW = eW * eScale;
                            eH = eH * eScale;
                            const ex = eqx + 5 + (maxEqSize - eW) / 2;
                            const ey = eqy + 5 + (maxEqSize - eH) / 2;
                            ctx.drawImage(eqImg, ex, ey, eW, eH);
                        }
                    }
                    
                    let drawDefaultDot = true;
                    if (eqObj.enhanceStatus && equipRefineImgs[eqObj.enhanceStatus - 1]) {
                        ctx.drawImage(equipRefineImgs[eqObj.enhanceStatus - 1], eqx + 2, eqy + 2, 24, 18);
                        drawDefaultDot = false;
                    }
                    
                    if (drawDefaultDot && eqObj.enhanceStatus) {
                        ctx.fillStyle = '#00e5ff'; 
                        ctx.beginPath();
                        ctx.arc(eqx + 15, eqy + 15, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    let rColor = 'rgba(255,255,255,0.2)'; 
                    if (eqObj.rarity && eqObj.rarity.key) {
                        const match = eqObj.rarity.key.match(/\d+/);
                        if (match && RARITY_COLORS[match[0]]) {
                            rColor = RARITY_COLORS[match[0]];
                        }
                    }
                    ctx.fillStyle = rColor;
                    ctx.fillRect(eqx, eqy + eqSize - 4, eqSize, 4);
                }
            }
        }
        
        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(cx, charY + charH - 4, charW, 4);
    }

    // 6. 底部浮水印資訊
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = "14px 'Noto Sans TC', sans-serif";
    const serverName = SERVER_ID_TO_NAME[serverId] || serverId || 'Asia';
    ctx.fillText(`UID: ${uid}   Server: ${serverName}`, 40, HEIGHT - 15);
    
    ctx.textAlign = 'right';
    ctx.fillText(text.assistant, WIDTH - 40, HEIGHT - 15);
    ctx.textAlign = 'left';

    // 產生 Buffer
    return canvas.toBuffer('image/png');
}

/**
 * 繪製 Phase 2 背景（全息基地底圖、環境漸層與右上裝飾線條）
 */
function drawPhase2Background(ctx, WIDTH, HEIGHT, bgImg, isPass) {
    ctx.fillStyle = '#0b0c0f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (bgImg) {
        const isWideBg = bgImg.width >= bgImg.height;
        if (isWideBg) {
            // 寬版實機景深圖：採 cover 等比鋪滿 1920×1080，保留完整左右構圖與自帶光效
            const scale = Math.max(WIDTH / bgImg.width, HEIGHT / bgImg.height);
            const drawW = Math.round(bgImg.width * scale);
            const drawH = Math.round(bgImg.height * scale);
            const drawX = Math.round((WIDTH - drawW) / 2);
            const drawY = Math.round((HEIGHT - drawH) / 2);
            ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);
        } else {
            const sy = Math.floor(bgImg.height * 0.44);
            const sh = bgImg.height - sy;
            const drawH = HEIGHT;
            const drawW = Math.round((bgImg.width / sh) * drawH);
            const drawX = Math.round((WIDTH - drawW) * 0.42);

            ctx.drawImage(bgImg, 0, sy, bgImg.width, sh, drawX, 0, drawW, drawH);

            // 左右邊緣柔和融入底色，避免垂直截斷感
            const leftFade = ctx.createLinearGradient(drawX, 0, drawX + 260, 0);
            leftFade.addColorStop(0, '#0b0c0f');
            leftFade.addColorStop(1, 'rgba(11, 12, 15, 0)');
            ctx.fillStyle = leftFade;
            ctx.fillRect(0, 0, drawX + 260, HEIGHT);

            const rightFadeStart = drawX + drawW - 260;
            const rightFade = ctx.createLinearGradient(rightFadeStart, 0, drawX + drawW, 0);
            rightFade.addColorStop(0, 'rgba(11, 12, 15, 0)');
            rightFade.addColorStop(1, '#0b0c0f');
            ctx.fillStyle = rightFade;
            ctx.fillRect(rightFadeStart, 0, WIDTH - rightFadeStart, HEIGHT);
        }
    }

    const usingWideBg = Boolean(bgImg && bgImg.width >= bgImg.height);

    // 左側深色遮罩確保文字可讀性（寬版背景自帶深暗雲霧，降低遮罩強度避免壓暗景深細節）
    const leftOverlay = ctx.createLinearGradient(0, 0, WIDTH * 0.44, 0);
    leftOverlay.addColorStop(0, usingWideBg ? 'rgba(10, 11, 14, 0.45)' : 'rgba(10, 11, 14, 0.72)');
    leftOverlay.addColorStop(0.6, usingWideBg ? 'rgba(10, 11, 14, 0.14)' : 'rgba(10, 11, 14, 0.22)');
    leftOverlay.addColorStop(1, 'rgba(10, 11, 14, 0)');
    ctx.fillStyle = leftOverlay;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // 左側背景淡灰大型幾何底紋（大圓環與斜線徽章輪廓）
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(140, 560, 290, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(140, 560, 200, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(40, 320);
    ctx.lineTo(390, 560);
    ctx.lineTo(40, 800);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 窄版底圖補充紫藍光束與底部黃綠光暈；寬版背景已內建對應光效，避免重複過曝
    if (!usingWideBg) {
        if (isPass) {
            const prismGrad = ctx.createLinearGradient(0, 740, 520, 790);
            prismGrad.addColorStop(0, 'rgba(190, 45, 210, 0.18)');
            prismGrad.addColorStop(0.5, 'rgba(65, 165, 255, 0.14)');
            prismGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = prismGrad;
            ctx.fillRect(0, 725, 520, 55);
        }

        const bottomGlow = ctx.createLinearGradient(0, HEIGHT - 300, 0, HEIGHT);
        bottomGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
        bottomGlow.addColorStop(0.55, isPass ? 'rgba(218, 232, 34, 0.22)' : 'rgba(179, 75, 51, 0.20)');
        bottomGlow.addColorStop(1, isPass ? 'rgba(232, 238, 38, 0.52)' : 'rgba(185, 72, 46, 0.45)');
        ctx.fillStyle = bottomGlow;
        ctx.fillRect(0, HEIGHT - 300, WIDTH, 300);
    }

    // 右上角與幹員區上方黃綠幾何線框裝飾
    const accentStroke = isPass ? 'rgba(222, 236, 38, 0.48)' : 'rgba(190, 90, 65, 0.40)';
    const accentFill = isPass ? 'rgba(218, 232, 36, 0.34)' : 'rgba(190, 90, 65, 0.28)';
    ctx.save();
    ctx.strokeStyle = accentStroke;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
        const ox = 1588 + i * 48;
        ctx.beginPath();
        ctx.moveTo(ox, 48);
        ctx.lineTo(ox + 32, 48);
        ctx.lineTo(ox + 16, 76);
        ctx.closePath();
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(1560, 90);
    ctx.lineTo(1836, 90);
    ctx.stroke();

    // 幹員區下方大倒三角形裝飾＋點陣 x 與 RGB 色塊（1:1 還原實機圖右側底部）
    const triX = 1272;
    const triY = 835;
    ctx.fillStyle = accentFill;
    ctx.beginPath();
    ctx.moveTo(triX, triY);
    ctx.lineTo(triX + 215, triY);
    ctx.lineTo(triX + 107.5, triY + 185);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.font = "bold 11px 'Noto Sans TC', sans-serif";
    ctx.fillText('x x x x x x x', 1324, 922);
    ctx.fillText('x x x x x x x', 1324, 936);
    ctx.fillText('x x x x x x x', 1324, 950);

    // 右側斜下方微小色彩校正方塊（CMYK 工業標籤）
    const chipY = 964;
    const chipStartX = 1782;
    const chipColors = ['#00e5ff', '#ff2a85', '#ffe600'];
    for (let c = 0; c < chipColors.length; c++) {
        ctx.fillStyle = chipColors[c];
        ctx.fillRect(chipStartX + c * 11, chipY, 8, 8);
    }
    ctx.restore();
}

/**
 * 繪製 Phase 2 英文副標（CONTINGENCY CONTRACT + 雙色條 + INDIGO EXPERIMENTAL OPERATION）
 */
function drawPhase2ContractBadge(ctx, x, y, contractName, isPass) {
    ctx.save();
    const isIndigo = !contractName || /浸藍|浸蓝|INDIGO/i.test(contractName);

    ctx.fillStyle = '#ffffff';
    ctx.font = "900 20px 'Noto Sans TC', sans-serif";
    ctx.fillText('CONTINGENCY', x, y + 18);

    // 洋紅＋亮綠雙色識別條
    ctx.fillStyle = '#eb00ff';
    ctx.fillRect(x, y + 25, 30, 7);
    ctx.fillStyle = '#00ff38';
    ctx.fillRect(x, y + 32, 30, 7);

    ctx.fillStyle = '#ffffff';
    ctx.font = "900 20px 'Noto Sans TC', sans-serif";
    ctx.fillText('CONTRACT', x + 38, y + 39);

    // 右側邊框徽章（框體寬高貼齊文字內容，無過多留白）
    const boxX = x + 168;
    const boxY = y + 4;
    const mainTag = isIndigo ? 'INDIGO' : (contractName || 'OPERATION').slice(0, 18);
    const subTag = 'EXPERIMENTAL OPERATION';

    ctx.font = "bold 17px 'Noto Sans TC', sans-serif";
    const mainTagW = ctx.measureText(mainTag).width;
    ctx.font = "bold 12px 'Noto Sans TC', sans-serif";
    const subTagW = ctx.measureText(subTag).width;

    const boxW = Math.ceil(Math.max(mainTagW, subTagW)) + 10;
    const boxH = 34;
    ctx.strokeStyle = isPass ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 160, 140, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 17px 'Noto Sans TC', sans-serif";
    ctx.fillText(mainTag, boxX + 5, boxY + 16);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = "bold 12px 'Noto Sans TC', sans-serif";
    ctx.fillText(subTag, boxX + 5, boxY + 30);
    ctx.restore();
}

/**
 * 繪製 Phase 2 左側作戰結算資訊欄
 */
async function drawPhase2LeftPanel(ctx, params) {
    const {
        text,
        indicatorCount,
        timeStr,
        isPass,
        passWave,
        selectedIndicators,
        contractName,
        assets,
    } = params;

    const panelX = 110;
    const panelW = 620;
    const primaryColor = isPass ? '#e8f522' : '#e05b3f';

    // 1. 行動時長橫條（橢圓膠囊造型）
    const durY = 104;
    const durH = 44;
    const durGrad = ctx.createLinearGradient(panelX, durY, panelX + panelW, durY);
    durGrad.addColorStop(0, 'rgba(255, 255, 255, 0.11)');
    durGrad.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(panelX, durY, panelW, durH, durH / 2);
    ctx.fillStyle = durGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.actionDuration, panelX + 24, durY + 29);

    ctx.font = "bold 26px 'Noto Sans TC', sans-serif";
    const timeWidth = ctx.measureText(timeStr).width;
    const timeX = panelX + panelW - 24 - timeWidth;
    if (assets.clockImg) {
        const tintedClock = tintIcon(assets.clockImg, '#ffffff', 24);
        ctx.drawImage(tintedClock, timeX - 34, durY + 10, 24, 24);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(timeStr, timeX, durY + 31);

    // 2. 分數與三枚菱形波次徽章 (I / II / III)
    const scoreY = 262;
    const scoreStr = String(indicatorCount);
    ctx.fillStyle = primaryColor;
    ctx.font = "normal 104px 'Noto Sans TC', sans-serif";
    ctx.fillText(scoreStr, panelX + 2, scoreY);

    const scoreW = ctx.measureText(scoreStr).width;
    const arrowX = panelX + 22 + scoreW;
    const arrowY = scoreY - 38;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY - 7);
    ctx.lineTo(arrowX + 11, arrowY);
    ctx.lineTo(arrowX, arrowY + 7);
    ctx.closePath();
    ctx.fill();

    const medalStartX = arrowX + 24;
    const medalY = scoreY - 72;
    const medalSize = 68;
    const medalStep = 70;
    for (let i = 0; i < 3; i++) {
        const mx = medalStartX + i * medalStep;
        const waveCleared = isPass || passWave >= i + 1;
        if (waveCleared && assets.waveImgs[i]) {
            ctx.drawImage(assets.waveImgs[i], mx, medalY, medalSize, medalSize);
        } else if (assets.waveFailImg) {
            const sliceW = assets.waveFailImg.width / 3;
            ctx.drawImage(
                assets.waveFailImg,
                i * sliceW, 0, sliceW, assets.waveFailImg.height,
                mx, medalY, medalSize, medalSize
            );
        } else {
            ctx.fillStyle = waveCleared ? primaryColor : 'rgba(255,255,255,0.25)';
            ctx.font = "bold 24px 'Noto Sans TC', sans-serif";
            ctx.fillText(['I', 'II', 'III'][i], mx + 24, medalY + 45);
        }
    }

    // 3. 指標總計（放大左側圖標並移除新紀錄標籤）
    const totalY = 306;
    const totalIconSize = 36;
    let labelX = panelX + 2;
    if (assets.indTotalImg) {
        const tintedTotal = tintIcon(assets.indTotalImg, '#ffffff', totalIconSize);
        ctx.drawImage(tintedTotal, labelX, totalY - 27, totalIconSize, totalIconSize);
        labelX += totalIconSize + 8;
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 24px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.totalIndicators, labelX, totalY);

    // 4. 指標一覽網格 (預設 9 欄 × 2~3 列)
    const listTitleY = 368;
    ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
    const listTitleW = ctx.measureText(text.indicatorList).width;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillRect(panelX, listTitleY - 24, listTitleW, 2.5);
    ctx.fillStyle = 'rgba(235, 238, 242, 0.9)';
    ctx.fillText(text.indicatorList, panelX, listTitleY);

    const gridY = listTitleY + 18;
    const cols = 9;
    const cellSize = 60;
    const cellGap = 9;
    const maxVisibleCells = 27;
    const overflowCount = Math.max(0, selectedIndicators.length - maxVisibleCells);
    const visibleIndicators = selectedIndicators.slice(0, maxVisibleCells);
    const indIconImgs = await Promise.all(visibleIndicators.map(ind => safeLoadImage(ind.icon)));

    for (let i = 0; i < visibleIndicators.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const ix = panelX + col * (cellSize + cellGap);
        const iy = gridY + row * (cellSize + cellGap);

        ctx.fillStyle = 'rgba(16, 18, 22, 0.85)';
        ctx.fillRect(ix, iy, cellSize, cellSize);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ix, iy, cellSize, cellSize);

        const iconImg = indIconImgs[i];
        if (iconImg) {
            const maxS = cellSize - 4;
            const scale = Math.min(maxS / iconImg.width, maxS / iconImg.height);
            const dw = iconImg.width * scale;
            const dh = iconImg.height * scale;
            ctx.drawImage(iconImg, ix + (cellSize - dw) / 2, iy + (cellSize - dh) / 2, dw, dh);
        }

        if (overflowCount > 0 && i === maxVisibleCells - 1) {
            ctx.fillStyle = 'rgba(10, 12, 16, 0.78)';
            ctx.fillRect(ix + 1, iy + 1, cellSize - 2, cellSize - 2);
            ctx.fillStyle = '#ffffff';
            ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
            ctx.textAlign = 'center';
            ctx.fillText(`+${overflowCount}`, ix + cellSize / 2, iy + cellSize / 2 + 7);
            ctx.textAlign = 'left';
        }
    }

    // 依據實際指標列數推算下方主標題位置，避免 3 列指標時重疊
    const rowsUsed = Math.max(2, Math.ceil(visibleIndicators.length / cols));
    const afterGridY = gridY + rowsUsed * (cellSize + cellGap) + 30;

    // 5. 行動成功 / 行動中斷 + CONTINGENCY CONTRACT INDIGO 徽章（依 panelW 自適應縮放防止長英文截斷）
    const statusText = isPass ? text.actionSuccess : text.actionFail;
    const baseStatusFontSize = 82;
    ctx.font = `normal ${baseStatusFontSize}px 'Noto Sans TC', sans-serif`;
    const measuredStatusW = ctx.measureText(statusText).width;
    const statusFontSize = measuredStatusW > panelW
        ? Math.max(36, Math.floor(baseStatusFontSize * (panelW / measuredStatusW)))
        : baseStatusFontSize;
    ctx.fillStyle = primaryColor;
    ctx.font = `normal ${statusFontSize}px 'Noto Sans TC', sans-serif`;
    ctx.fillText(statusText, panelX - 2, afterGridY + 70, panelW);

    drawPhase2ContractBadge(ctx, panelX + 2, afterGridY + 90, contractName, isPass);

    // 6. 聖所評喻橫幅（僅在行動成功時顯示；失敗不予評喻）
    if (!isPass) return;

    const ratingY = afterGridY + 156;
    const ratingH = 44;
    const ratingColors = getPhase2RatingColors(isPass, indicatorCount);
    const isHighRedTier = indicatorCount >= 30;
    const accentStart = isHighRedTier ? '#f05a28' : ratingColors.start;
    const accentEnd = isHighRedTier ? '#d92f2f' : ratingColors.end;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(panelX, ratingY, panelW, ratingH, 2);
    ctx.clip();

    // 純黑灰底色＋45° 黑灰斜線條碳纖維紋理
    ctx.fillStyle = 'rgba(18, 20, 24, 0.94)';
    ctx.fillRect(panelX, ratingY, panelW, ratingH);

    const stripeStep = 8;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.beginPath();
    for (let sx = panelX - ratingH; sx < panelX + panelW + ratingH; sx += stripeStep) {
        ctx.moveTo(sx, ratingY + ratingH);
        ctx.lineTo(sx + ratingH, ratingY);
    }
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    for (let sx = panelX - ratingH + 3; sx < panelX + panelW + ratingH; sx += stripeStep) {
        ctx.moveTo(sx, ratingY + ratingH);
        ctx.lineTo(sx + ratingH, ratingY);
    }
    ctx.stroke();

    // 開頭左側（驚嘆號區域）局部柔和漸層光暈
    const leftGlow = ctx.createLinearGradient(panelX, ratingY, panelX + 120, ratingY);
    leftGlow.addColorStop(0, isHighRedTier ? 'rgba(235, 72, 42, 0.36)' : 'rgba(130, 120, 245, 0.32)');
    leftGlow.addColorStop(1, 'rgba(18, 20, 24, 0)');
    ctx.fillStyle = leftGlow;
    ctx.fillRect(panelX, ratingY, 120, ratingH);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(panelX, ratingY, panelW, ratingH, 2);
    ctx.stroke();

    const barGrad = ctx.createLinearGradient(panelX, ratingY, panelX, ratingY + ratingH);
    barGrad.addColorStop(0, accentStart);
    barGrad.addColorStop(1, accentEnd);
    ctx.fillStyle = barGrad;
    ctx.fillRect(panelX, ratingY + 1, 4, ratingH - 2);

    // 左側白色實心圓形 i 圖示（放大並上下緊貼橫幅邊框，內部字元以實際邊界盒精確上下左右置中）
    const infoR = 16;
    const infoCx = panelX + 24;
    const infoCy = ratingY + ratingH / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(infoCx, infoCy, infoR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1d22';
    ctx.font = "900 21px 'Noto Sans TC', sans-serif";
    ctx.textAlign = 'left';
    const infoMetrics = ctx.measureText('i');
    const infoTextX = infoCx - (infoMetrics.actualBoundingBoxLeft + infoMetrics.actualBoundingBoxRight) / 2;
    const infoTextY = infoCy + (infoMetrics.actualBoundingBoxAscent - infoMetrics.actualBoundingBoxDescent) / 2;
    ctx.fillText('i', infoTextX, infoTextY);

    ctx.fillStyle = '#e5e8ec';
    ctx.font = "bold 21px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.sanctumRating, panelX + 50, ratingY + 30);

    // 右側圓角框體（左紅右黑漸層底色＋緊貼數字上下緣＋超出框線的大尺寸圖標）
    ctx.font = "bold 21px 'Noto Sans TC', sans-serif";
    const numW = ctx.measureText(scoreStr).width;
    const iconSize = 34;
    const tagPadX = 7;
    const tagGap = 3;
    const tagW = Math.ceil(tagPadX * 2 + numW + tagGap + iconSize);
    const tagH = 19;
    const tagX = panelX + panelW - tagW - 18;
    const tagY = ratingY + (ratingH - tagH) / 2;

    const tagGrad = ctx.createLinearGradient(tagX, tagY, tagX + tagW, tagY);
    tagGrad.addColorStop(0, 'rgba(188, 34, 38, 0.95)');
    tagGrad.addColorStop(0.5, 'rgba(92, 20, 24, 0.92)');
    tagGrad.addColorStop(1, 'rgba(14, 15, 18, 0.95)');
    const tagBorder = isHighRedTier ? 'rgba(232, 86, 72, 0.90)' : ratingColors.end;
    drawRoundedRect(ctx, tagX, tagY, tagW, tagH, 5, tagGrad, tagBorder, 1.5);

    const contentW = numW + tagGap + iconSize;
    const contentStartX = tagX + (tagW - contentW) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 21px 'Noto Sans TC', sans-serif";
    ctx.fillText(scoreStr, contentStartX, tagY + 17);

    if (assets.indTotalImg) {
        const whiteIndTotal = tintIcon(assets.indTotalImg, '#ffffff', iconSize);
        ctx.drawImage(whiteIndTotal, contentStartX + numW + tagGap, tagY + (tagH - iconSize) / 2, iconSize, iconSize);
    }
}

/**
 * 預先並行載入單張幹員卡片所需的遠端與本地圖片，避免繪製時交錯操作 ctx.clip()
 */
async function preloadPhase2CardAssets(charObj, charMeta) {
    if (!charObj) return null;

    const profKey = charMeta?.profession?.key;
    const rawPot = Number(charObj.potentialLevel);
    const potLevel = Number.isFinite(rawPot) ? Math.max(0, Math.min(5, rawPot)) : 0;
    const rawRefine = Number(charObj.weapon?.refineLevel);
    const refineLevel = Number.isFinite(rawRefine) ? Math.max(0, Math.min(5, rawRefine)) : 0;
    const eqKeys = ['bodyEquip', 'armEquip', 'firstAccessory', 'secondAccessory'];

    const [avatarImg, profImg, potImg, wRefineImg, wIconImg, ...eqImgs] = await Promise.all([
        safeLoadImage(charObj.avatarUrl),
        profKey ? safeLoadImage(path.join(__dirname, '../assets/images/character', `${profKey}.png`)) : Promise.resolve(null),
        safeLoadImage(path.join(__dirname, '../assets/images/character', `potential_${potLevel}.png`)),
        safeLoadImage(path.join(__dirname, '../assets/images/character', `potential_${refineLevel}.png`)),
        safeLoadImage(charObj.weapon?.icon),
        ...eqKeys.map(k => safeLoadImage(charObj.equips?.[k]?.icon)),
    ]);

    return {
        avatarImg,
        profImg,
        potImg,
        wRefineImg,
        wIconImg,
        eqImgs
    };
}

/**
 * 將 #RRGGBB 或 rgb/rgba 字串轉為同色相但透明度為 0 的 rgba()，避免漸層插值出現發黑問題
 */
function toTransparentRgba(color) {
    if (typeof color === 'string') {
        const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
        if (hex) {
            const r = parseInt(hex[1].slice(0, 2), 16);
            const g = parseInt(hex[1].slice(2, 4), 16);
            const b = parseInt(hex[1].slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, 0)`;
        }
        const rgb = color.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgb) {
            return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0)`;
        }
    }
    return 'rgba(0, 0, 0, 0)';
}

/**
 * 於無變換矩陣的離屏畫布先烘焙圖片陰影再貼回，規避 node-canvas 在 ctx.scale() 下使用 shadowBlur + drawImage 產生的偏移黑斑 bug
 */
function drawImageWithShadow(ctx, img, x, y, w, h, shadowColor, shadowBlur, shadowOffsetY = 0) {
    const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : { a: 1, b: 0 };
    const resScale = Math.max(1, Math.hypot(m.a, m.b));
    const pad = Math.ceil(shadowBlur + Math.abs(shadowOffsetY) + 4);
    const tmp = createCanvas(Math.ceil((w + pad * 2) * resScale), Math.ceil((h + pad * 2) * resScale));
    const tCtx = tmp.getContext('2d');
    tCtx.shadowColor = shadowColor;
    tCtx.shadowBlur = shadowBlur * resScale;
    tCtx.shadowOffsetY = shadowOffsetY * resScale;
    tCtx.drawImage(img, pad * resScale, pad * resScale, w * resScale, h * resScale);
    ctx.drawImage(tmp, x - pad, y - pad, w + pad * 2, h + pad * 2);
}

/**
 * 繪製 Z-4 裝備卡槽左上角懸浮升級徽章（優先使用 enhance_1/2/3.svg 區分階級，無資產時退回向量圖示）
 */
function drawEquipmentUpgradeBadge(ctx, sx, sy, slotSize, enhanceCount = 1, enhanceImgs = []) {
    const badgeSize = slotSize * 0.36;
    const badgeRadius = slotSize * 0.08;
    const badgeX = sx - slotSize * 0.10;
    const badgeY = sy - slotSize * 0.10;

    // 深灰圓角底板（獨立狀態與投影，畫完立刻清除）
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#2E2E2E';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, badgeRadius);
    ctx.fill();
    ctx.restore();

    const idx = Math.max(0, Math.min(enhanceImgs.length - 1, Math.floor(enhanceCount) - 1));
    const svgImg = Array.isArray(enhanceImgs) ? enhanceImgs[idx] : null;
    if (svgImg) {
        const pad = badgeSize * 0.14;
        const maxW = badgeSize - pad * 2;
        const maxH = badgeSize - pad * 2;
        const scale = Math.min(maxW / svgImg.width, maxH / svgImg.height);
        const dw = svgImg.width * scale;
        const dh = svgImg.height * scale;
        ctx.drawImage(
            svgImg,
            badgeX + (badgeSize - dw) / 2,
            badgeY + (badgeSize - dh) / 2,
            dw,
            dh
        );
        return;
    }

    // 向量 Fallback（無 SVG 時依階級區分：+1 灰、+2 半藍、+3 全藍）
    ctx.save();
    const iconColor = enhanceCount >= 3 ? '#29B6F6' : enhanceCount === 2 ? '#80D8FF' : '#8E9299';
    const hexCx = badgeX + badgeSize * 0.40;
    const hexCy = badgeY + badgeSize * 0.59;
    const hexR = badgeSize * 0.26;

    ctx.strokeStyle = iconColor;
    ctx.lineWidth = Math.max(2.2, slotSize * 0.045);
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = -Math.PI / 2 + i * (Math.PI / 3);
        const vx = hexCx + hexR * Math.cos(angle);
        const vy = hexCy + hexR * Math.sin(angle);
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.stroke();

    const tipX = badgeX + badgeSize * 0.90;
    const tipY = badgeY + badgeSize * 0.10;
    ctx.fillStyle = enhanceCount >= 2 ? '#29B6F6' : '#8E9299';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - badgeSize * 0.27, tipY + badgeSize * 0.07);
    ctx.lineTo(tipX - badgeSize * 0.07, tipY + badgeSize * 0.27);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/**
 * 局部重構：扁平工業風＋多層次錯位 2×2 裝備區塊（使用獨立局部座標隔離狀態）
 */
function drawPhase2EquipmentSection(ctx, sectionX, sectionY, sectionW, sectionH, charObj, cardAssets, assets) {
    ctx.save();
    ctx.translate(sectionX, sectionY);

    const slotSize = 58;
    const slotGap = 10;
    const gridW = slotSize * 2 + slotGap;
    const gridH = slotSize * 2 + slotGap;
    const gridX = Math.floor((sectionW - gridW) / 2);
    const railW = gridW + 8;
    const railX = gridX - 4;
    const railH = 2.5;

    // 武器欄底緣至導軌頂緣、導軌底緣至第一排裝備頂緣、第二排裝備底緣至卡片底線維持三段嚴格等距
    const equalGap = (sectionH - railH - gridH) / 3;
    const railY = equalGap;

    // 頂部分隔導軌（霧灰色橫槓，對齊裝備區左右邊界）
    ctx.fillStyle = '#4D4D4D';
    ctx.fillRect(railX, railY, railW, railH);

    const gridY = railY + railH + equalGap;
    const eqKeys = ['bodyEquip', 'armEquip', 'firstAccessory', 'secondAccessory'];
    const pendingBadges = [];

    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
            const idx = row * 2 + col;
            const eqObj = charObj.equips ? charObj.equips[eqKeys[idx]] : null;
            const eqImg = cardAssets.eqImgs[idx];
            const sx = gridX + col * (slotSize + slotGap);
            const sy = gridY + row * (slotSize + slotGap);

            // 空白卡槽狀態：僅繪製最外層淺灰色定位線框，不畫色塊與徽章
            if (!eqObj || !eqImg) {
                ctx.strokeStyle = '#6E6E6E';
                ctx.lineWidth = 1.8;
                ctx.strokeRect(sx, sy, slotSize, slotSize);
                continue;
            }

            // Z-1 稀有度背景色塊（75% 尺寸置中，加大色塊與框線間距；左至右 0~75% 漸變至完全透明）
            const innerSize = slotSize * 0.75;
            const innerX = sx + (slotSize - innerSize) / 2;
            const innerY = sy + (slotSize - innerSize) / 2;
            const blockColor = getRarityColor(eqObj, '#E6A800', EQUIP_BLOCK_RARITY_COLORS);
            const transparentColor = toTransparentRgba(blockColor);
            const blockGrad = ctx.createLinearGradient(innerX, 0, innerX + innerSize, 0);
            blockGrad.addColorStop(0, blockColor);
            blockGrad.addColorStop(0.75, transparentColor);
            blockGrad.addColorStop(1, transparentColor);
            ctx.fillStyle = blockGrad;
            ctx.fillRect(innerX, innerY, innerSize, innerSize);

            // Z-2 裝備立繪（放大至 114% 並向右下角偏移 16%，僅於外框範圍內裁切渲染）
            const targetSize = slotSize * 1.14;
            const scale = Math.min(targetSize / eqImg.width, targetSize / eqImg.height);
            const ew = eqImg.width * scale;
            const eh = eqImg.height * scale;
            const offsetX = slotSize * 0.16;
            const offsetY = slotSize * 0.16;
            ctx.save();
            ctx.beginPath();
            ctx.rect(sx, sy, slotSize, slotSize);
            ctx.clip();
            ctx.drawImage(eqImg, sx + (slotSize - ew) / 2 + offsetX, sy + (slotSize - eh) / 2 + offsetY, ew, eh);
            ctx.restore();

            // Z-3 最外層定位線框（淺灰銳角實線框壓在色塊與裝備立繪之上，使框線覆蓋跨線的裝備圖標）
            ctx.strokeStyle = '#6E6E6E';
            ctx.lineWidth = 1.8;
            ctx.strokeRect(sx, sy, slotSize, slotSize);

            // Z-4 記錄左上角懸浮升級徽章位置與階級，統一於最高圖層繪製以覆蓋裝備圖標左上局部
            const enhanceCount = Number(eqObj.enhanceStatus ?? eqObj.upgradeCount ?? 0);
            if (enhanceCount >= 1) {
                pendingBadges.push({ sx, sy, enhanceCount });
            }
        }
    }

    for (const { sx, sy, enhanceCount } of pendingBadges) {
        drawEquipmentUpgradeBadge(ctx, sx, sy, slotSize, enhanceCount, assets.enhanceImgs);
    }

    ctx.restore();
}

/**
 * 繪製 Phase 2 單張幹員出戰卡片（同步繪製以隔離 ctx.clip() 狀態）
 */
function drawPhase2OperatorCard(ctx, cx, cy, cw, ch, charObj, cardAssets, isPass, assets) {
    const weaponY = cy + 404;
    const weaponH = 104;
    const weaponExtLeft = 12;
    const wx = cx - weaponExtLeft;
    const weaponBoxW = cw + weaponExtLeft;
    const wBoxRadius = 8;

    // 繪製卡片主體外框與灰黑底色；若存在武器外框，以 evenodd 裁切挖空該區域避免原本角色外框線與底色穿透武器外框
    ctx.save();
    if (charObj && cardAssets) {
        traceRoundedRectPath(ctx, wx, weaponY, weaponBoxW, weaponH, wBoxRadius);
        ctx.rect(cx - 4, cy - 4, cw + 8, ch + 8);
        ctx.clip('evenodd');
    }
    drawRoundedRect(ctx, cx, cy, cw, ch, 2, 'rgba(30, 31, 35, 0.90)', 'rgba(255, 255, 255, 0.10)', 1);
    ctx.restore();

    // 幹員頂部色條依據幹員 rarity 著色，缺乏資料時退回通關/失敗主題色
    const topAccent = getRarityColor(charObj, isPass ? '#d8e622' : '#b34b33');
    ctx.fillStyle = topAccent;
    ctx.fillRect(cx, cy, cw, 5);

    if (!charObj || !cardAssets) return;

    const portraitH = 388;

    // (A) 幹員半身立繪（離屏渲染並於尾部加上平滑漸變至透明之 alpha 遮罩）
    const transform = typeof ctx.getTransform === 'function' ? ctx.getTransform() : { a: 1, b: 0 };
    const resScale = Math.max(1, Math.hypot(transform.a, transform.b));
    const portraitCanvas = createCanvas(Math.ceil(cw * resScale), Math.ceil(portraitH * resScale));
    const pCtx = portraitCanvas.getContext('2d');
    pCtx.scale(resScale, resScale);

    if (cardAssets.avatarImg) {
        const avatarImg = cardAssets.avatarImg;
        const baseScale = Math.max((cw + 40) / avatarImg.width, portraitH / avatarImg.height);
        const closeupScale = baseScale * 1.48;
        const dw = avatarImg.width * closeupScale;
        const dh = avatarImg.height * closeupScale;
        pCtx.drawImage(avatarImg, (cw - dw) / 2, -17, dw, dh);
    } else {
        pCtx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        pCtx.fillRect(0, 0, cw, portraitH);
    }

    if (assets.charTopMaskImg) {
        pCtx.drawImage(assets.charTopMaskImg, 0, 0, cw, 90);
    }

    const fadeStartStop = Math.max(0, (portraitH - 62) / portraitH);
    const fadeMidStop = Math.max(fadeStartStop, (portraitH - 28) / portraitH);
    const alphaMask = pCtx.createLinearGradient(0, 0, 0, portraitH);
    alphaMask.addColorStop(0, 'rgba(0, 0, 0, 1)');
    alphaMask.addColorStop(fadeStartStop, 'rgba(0, 0, 0, 1)');
    alphaMask.addColorStop(fadeMidStop, 'rgba(0, 0, 0, 0.45)');
    alphaMask.addColorStop(1, 'rgba(0, 0, 0, 0)');
    pCtx.globalCompositeOperation = 'destination-in';
    pCtx.fillStyle = alphaMask;
    pCtx.fillRect(0, 0, cw, portraitH);

    ctx.drawImage(portraitCanvas, cx, cy + 5, cw, portraitH);

    // 左上角職業圖標（無外框，圖標可視區域與深底大小貼合，無過多留白）
    if (cardAssets.profImg) {
        ctx.fillStyle = 'rgba(10, 12, 16, 0.78)';
        ctx.fillRect(cx + 10, cy + 12, 36, 36);
        const whiteProf = tintIcon(cardAssets.profImg, '#ffffff', 40);
        ctx.drawImage(whiteProf, cx + 8, cy + 10, 40, 40);
    }

    // 右上細微角標
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(cx + cw - 12, cy + 13, 4, 26);

    // 等級與潛能（命座）星芒（無外框，放大圖示並加陰影確保清晰）
    const lvTopY = cy + 72;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = "bold 13px 'Noto Sans TC', sans-serif";
    ctx.fillText('Lv.', cx + 10, lvTopY);

    ctx.fillStyle = '#ffffff';
    ctx.font = "900 38px 'Noto Sans TC', sans-serif";
    ctx.fillText(String(charObj.level ?? 1), cx + 10, lvTopY + 34);
    ctx.restore();

    if (cardAssets.potImg) {
        const potY = lvTopY + 42;
        drawImageWithShadow(ctx, cardAssets.potImg, cx + 8, potY, 44, 44, 'rgba(0, 0, 0, 0.95)', 9, 1);
    }

    // (B) 武器區域（沿用上方定義之向左延伸圓角外框座標與 0→70% 漸變至透明框線）

    // 武器外框基底暗底（防止透過挖空區渲染到後方黃色主背景，使第 1 張卡片與其餘 3 張表現一致）
    drawRoundedRect(ctx, wx, weaponY, weaponBoxW, weaponH, wBoxRadius, 'rgba(20, 22, 26, 0.94)', null, 0);

    // 武器基質（詞條 9/9/4）右側各獨立矩形之水平位置幾何（先定義以便限制武器圖片不重疊至基質下方）
    const terms = Array.isArray(charObj.weapon?.weaponTerms) ? charObj.weapon.weaponTerms : [];
    const termBoxW = 46;
    const termBoxX = cx + cw - termBoxW - 2;
    const weaponClipW = terms.length > 0 ? Math.max(0, termBoxX - cx - 2) : cw;

    // 武器圖片再度放大（1.25× 框高）並限制裁切於原本角色卡片位置與基質左側之間，不超出原本卡片左緣且不渲染到基質下方
    if (cardAssets.wIconImg) {
        const wIconImg = cardAssets.wIconImg;
        const scale = (weaponH * 1.25) / wIconImg.height;
        const wImgW = wIconImg.width * scale;
        const wImgH = wIconImg.height * scale;
        const wImgX = cx + Math.round((weaponClipW - wImgW) / 2);
        const wImgY = weaponY + Math.round((weaponH - wImgH) / 2);

        ctx.save();
        ctx.beginPath();
        ctx.rect(cx, weaponY, weaponClipW, weaponH);
        ctx.clip();
        ctx.drawImage(wIconImg, wImgX, wImgY, wImgW, wImgH);
        ctx.restore();
    }

    // 武器外框背景色（層級高於武器圖片、低於 Lv 與命座；與邊框同色 rgb(165, 168, 175)，自左至右 35% 淡化結束）與 0→70% 漸隱框線
    const wBgGrad = ctx.createLinearGradient(wx, weaponY, wx + weaponBoxW * 0.35, weaponY);
    wBgGrad.addColorStop(0, 'rgba(165, 168, 175, 0.28)');
    wBgGrad.addColorStop(0.60, 'rgba(165, 168, 175, 0.11)');
    wBgGrad.addColorStop(1, 'rgba(165, 168, 175, 0)');

    const wStrokeGrad = ctx.createLinearGradient(wx, weaponY, wx + weaponBoxW * 0.70, weaponY);
    wStrokeGrad.addColorStop(0, 'rgba(165, 168, 175, 0.90)');
    wStrokeGrad.addColorStop(0.65, 'rgba(165, 168, 175, 0.42)');
    wStrokeGrad.addColorStop(1, 'rgba(165, 168, 175, 0)');

    drawRoundedRect(ctx, wx, weaponY, weaponBoxW, weaponH, wBoxRadius, wBgGrad, wStrokeGrad, 1.5);

    const hasWeapon = Boolean(charObj.weapon);
    const wLevel = charObj.weapon?.level ?? 1;
    const wLvX = wx + 10;
    ctx.font = "900 28px 'Noto Sans TC', sans-serif";
    const wLevelNumW = ctx.measureText(String(wLevel)).width;
    const weaponBarW = Math.ceil(ctx.measureText('999').width);

    if (hasWeapon) {
        // 武器精煉（命座）圖示：放大至視覺寬度與下方等級數字同寬，並對齊左緣
        if (cardAssets.wRefineImg) {
            const wRefineSize = Math.round(Math.max(28, wLevelNumW) * 1.28);
            drawImageWithShadow(ctx, cardAssets.wRefineImg, wLvX - 4, weaponY + 6, wRefineSize, wRefineSize, 'rgba(0, 0, 0, 0.92)', 6, 0);
        }

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 5;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.font = "bold 12px 'Noto Sans TC', sans-serif";
        ctx.fillText('Lv.', wLvX, weaponY + 63);
        ctx.fillStyle = '#ffffff';
        ctx.font = "900 28px 'Noto Sans TC', sans-serif";
        ctx.fillText(String(wLevel), wLvX, weaponY + 89);
        ctx.restore();

        // 武器下方稀有度色條（寬度固定為 3 位數字長度、對齊等級數值，並與底部邊框留出明確間距）
        ctx.fillStyle = getRarityColor(charObj.weapon, '#f5b800');
        ctx.fillRect(wLvX, weaponY + 95, weaponBarW, 4);
    } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.font = "bold 18px 'Noto Sans TC', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText('—', wx + weaponBoxW / 2, weaponY + weaponH / 2 + 6);
        ctx.textAlign = 'left';
    }

    // 武器基質（9/9/4）：三項各自獨立緊湊矩形，左端淡化至透明不渲染左上/左下角，右側圓角，底色同武器外框色，數字與橢圓圖標共用 #fff100
    if (terms.length > 0) {
        const termColor = '#fff100';
        const visibleCount = Math.min(terms.length, 3);
        const termItemH = 22;
        const rowPitch = 29;
        const totalTermsH = visibleCount * termItemH + (visibleCount - 1) * (rowPitch - termItemH);
        const startY = weaponY + Math.round((weaponH - totalTermsH) / 2);

        for (let t = 0; t < visibleCount; t++) {
            const ty = startY + t * rowPitch;
            const termStr = String(terms[t]);
            const termBgGrad = ctx.createLinearGradient(termBoxX, ty, termBoxX + termBoxW, ty);
            termBgGrad.addColorStop(0, 'rgba(165, 168, 175, 0)');
            termBgGrad.addColorStop(0.42, 'rgba(165, 168, 175, 0.28)');
            termBgGrad.addColorStop(1, 'rgba(165, 168, 175, 0.34)');

            drawRoundedRect(ctx, termBoxX, ty, termBoxW, termItemH, 4, termBgGrad, null, 0, 0);

            ctx.font = "bold 19px 'Noto Sans TC', sans-serif";
            const numWidth = ctx.measureText(termStr).width;
            const itemW = 12 + 3 + numWidth;
            const tx = termBoxX + Math.round((termBoxW - itemW) / 2) + 3;
            if (assets.termSlashImg) {
                ctx.drawImage(assets.termSlashImg, tx, ty + 3, 12, 16);
            } else {
                ctx.fillStyle = termColor;
                ctx.font = "900 17px 'Noto Sans TC', sans-serif";
                ctx.fillText('/', tx, ty + 17);
            }
            ctx.fillStyle = termColor;
            ctx.font = "bold 19px 'Noto Sans TC', sans-serif";
            ctx.fillText(termStr, tx + 15, ty + 17);
        }
    }

    // (C) 2×2 裝備區塊（緊接武器欄底緣起算，使武器底緣→導軌→裝備→卡片底線維持三段等距）
    const equipSectionY = weaponY + weaponH;
    const equipSectionH = cy + ch - 2 - equipSectionY;
    drawPhase2EquipmentSection(ctx, cx, equipSectionY, cw, equipSectionH, charObj, cardAssets, assets);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(cx, cy + ch - 2, cw, 2);
}

/**
 * 計算由螢幕座標 (x, y) 映射回單位來源平面 [0, 1]×[0, 1] 之單應性逆矩陣
 */
function createHomographyToUnit(dstQuad) {
    const [p0, p1, p2, p3] = dstQuad;
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const sx = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const sy = p0.y - p1.y + p2.y - p3.y;

    const det = dx1 * dy2 - dx2 * dy1 || 1e-6;
    const g = (sx * dy2 - dx2 * sy) / det;
    const h = (dx1 * sy - sx * dy1) / det;

    const a = p1.x - p0.x + g * p1.x;
    const b = p3.x - p0.x + h * p3.x;
    const c = p0.x;
    const d = p1.y - p0.y + g * p1.y;
    const e = p3.y - p0.y + h * p3.y;
    const f = p0.y;

    // 伴隨矩陣 adj(H)，除法消去行列式常數因子
    return [
        e - f * h, c * h - b, b * f - c * e,
        f * g - d, a - c * g, c * d - a * f,
        d * h - e * g, b * g - a * h, a * e - b * d,
    ];
}

/**
 * 依指定視平線與縮放參數產生向畫面中央傾斜的 3D 透視目標四邊形 [TL, TR, BR, BL]
 */
function buildInwardPerspectiveQuad(box, side, options = {}) {
    const {
        horizonY = 495,
        nearScale = 1.0,
        farScale = 0.93,
        widthCompression = 0.975,
    } = options;

    const scaleY = (y, s) => horizonY + (y - horizonY) * s;
    const isLeft = side === 'left';
    const leftX = isLeft ? box.x : box.x + box.w - box.w * widthCompression;
    const rightX = isLeft ? box.x + box.w * widthCompression : box.x + box.w;
    const sLeft = isLeft ? nearScale : farScale;
    const sRight = isLeft ? farScale : nearScale;

    return [
        { x: leftX, y: scaleY(box.y, sLeft) },
        { x: rightX, y: scaleY(box.y, sRight) },
        { x: rightX, y: scaleY(box.y + box.h, sRight) },
        { x: leftX, y: scaleY(box.y + box.h, sLeft) },
    ];
}

/**
 * 以 Premultiplied Alpha 雙線性採樣將 2× 超採樣離屏畫布 3D 透視投影到目標畫布
 */
function drawPerspectiveQuad(dstCtx, srcCanvas, dstQuad) {
    const sw = srcCanvas.width;
    const sh = srcCanvas.height;
    const srcCtx = srcCanvas.getContext('2d');
    const srcRaw = srcCtx.getImageData(0, 0, sw, sh).data;

    // 預先轉成預乘 Alpha 浮點緩衝區，確保透明邊緣混合不產生黑邊 halo
    const premul = new Float32Array(sw * sh * 4);
    for (let i = 0; i < srcRaw.length; i += 4) {
        const a = srcRaw[i + 3];
        if (a === 0) continue;
        const af = a / 255;
        premul[i] = srcRaw[i] * af;
        premul[i + 1] = srcRaw[i + 1] * af;
        premul[i + 2] = srcRaw[i + 2] * af;
        premul[i + 3] = a;
    }

    const minX = Math.floor(Math.min(dstQuad[0].x, dstQuad[1].x, dstQuad[2].x, dstQuad[3].x));
    const minY = Math.floor(Math.min(dstQuad[0].y, dstQuad[1].y, dstQuad[2].y, dstQuad[3].y));
    const maxX = Math.ceil(Math.max(dstQuad[0].x, dstQuad[1].x, dstQuad[2].x, dstQuad[3].x));
    const maxY = Math.ceil(Math.max(dstQuad[0].y, dstQuad[1].y, dstQuad[2].y, dstQuad[3].y));
    const outW = Math.max(1, maxX - minX);
    const outH = Math.max(1, maxY - minY);

    const outCanvas = createCanvas(outW, outH);
    const outCtx = outCanvas.getContext('2d');
    const outImg = outCtx.createImageData(outW, outH);
    const out = outImg.data;

    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = createHomographyToUnit(dstQuad);
    const maxSx = sw - 1;
    const maxSy = sh - 1;
    const rowStride = sw * 4;

    // 來源畫布已為 2× 超採樣，單點雙線性採樣即可涵蓋 2×2 子像素區域並保持平滑抗鋸齒
    for (let py = 0; py < outH; py++) {
        const gy = minY + py + 0.5;
        const rowOff = py * outW;
        const m01y = m01 * gy + m02;
        const m11y = m11 * gy + m12;
        const m21y = m21 * gy + m22;

        for (let px = 0; px < outW; px++) {
            const gx = minX + px + 0.5;
            const w = m20 * gx + m21y;
            if (w > -1e-6 && w < 1e-6) continue;

            const invW = 1 / w;
            const u = (m00 * gx + m01y) * invW;
            if (u < 0 || u > 1) continue;
            const v = (m10 * gx + m11y) * invW;
            if (v < 0 || v > 1) continue;

            const fx = u * maxSx;
            const fy = v * maxSy;
            const x0 = fx >= maxSx - 1 ? maxSx - 1 : fx <= 0 ? 0 : fx | 0;
            const y0 = fy >= maxSy - 1 ? maxSy - 1 : fy <= 0 ? 0 : fy | 0;
            const wx = fx - x0;
            const wy = fy - y0;
            const omx = 1 - wx;
            const omy = 1 - wy;
            const w00 = omx * omy;
            const w10 = wx * omy;
            const w01 = omx * wy;
            const w11 = wx * wy;

            const idx00 = y0 * rowStride + x0 * 4;
            const idx10 = idx00 + 4;
            const idx01 = idx00 + rowStride;
            const idx11 = idx01 + 4;

            const sumA = premul[idx00 + 3] * w00 + premul[idx10 + 3] * w10 + premul[idx01 + 3] * w01 + premul[idx11 + 3] * w11;
            if (sumA <= 0.5) continue;

            const sumR = premul[idx00] * w00 + premul[idx10] * w10 + premul[idx01] * w01 + premul[idx11] * w11;
            const sumG = premul[idx00 + 1] * w00 + premul[idx10 + 1] * w10 + premul[idx01 + 1] * w01 + premul[idx11 + 1] * w11;
            const sumB = premul[idx00 + 2] * w00 + premul[idx10 + 2] * w10 + premul[idx01 + 2] * w01 + premul[idx11 + 2] * w11;

            const outIdx = (rowOff + px) * 4;
            const invA = 255 / sumA;
            out[outIdx] = Math.min(255, Math.round(sumR * invA));
            out[outIdx + 1] = Math.min(255, Math.round(sumG * invA));
            out[outIdx + 2] = Math.min(255, Math.round(sumB * invA));
            out[outIdx + 3] = Math.min(255, Math.round(sumA));
        }
    }

    outCtx.putImageData(outImg, 0, 0);
    dstCtx.drawImage(outCanvas, minX, minY);
}

let phase2StaticAssetsPromise = null;

function getPhase2StaticAssets() {
    if (!phase2StaticAssetsPromise) {
        const phase2Dir = path.join(__dirname, '../assets/images/ui/phase2');
        phase2StaticAssetsPromise = Promise.all([
            safeLoadImage(path.join(phase2Dir, 'success_bg_wide.jpg')),
            safeLoadImage(path.join(phase2Dir, 'fail_bg.png')),
            safeLoadImage(path.join(phase2Dir, 'duration_clock.png')),
            safeLoadImage(path.join(phase2Dir, 'indicator_total.png')),
            safeLoadImage(path.join(phase2Dir, 'wave_fail.png')),
            safeLoadImage(path.join(phase2Dir, 'weapon_term_slash.png')),
            safeLoadImage(path.join(phase2Dir, 'char_top_mask.svg')),
            safeLoadImage(path.join(phase2Dir, 'wave_1.png')),
            safeLoadImage(path.join(phase2Dir, 'wave_2.png')),
            safeLoadImage(path.join(phase2Dir, 'wave_3.png')),
            safeLoadImage(path.join(phase2Dir, 'enhance_1.svg')),
            safeLoadImage(path.join(phase2Dir, 'enhance_2.svg')),
            safeLoadImage(path.join(phase2Dir, 'enhance_3.svg')),
        ]).then(([
            successBgImg,
            failBgImg,
            clockImg,
            indTotalImg,
            waveFailImg,
            termSlashImg,
            charTopMaskImg,
            ...restImgs
        ]) => ({
            successBgImg,
            failBgImg,
            clockImg,
            indTotalImg,
            waveFailImg,
            termSlashImg,
            charTopMaskImg,
            waveImgs: restImgs.slice(0, 3),
            enhanceImgs: restImgs.slice(3, 6),
        })).catch((err) => {
            phase2StaticAssetsPromise = null;
            throw err;
        });
    }
    return phase2StaticAssetsPromise;
}

/**
 * 繪製 Phase 2（浸藍測試作戰等新版）黃綠風格結算圖卡
 */
async function drawPhase2CrisisUI(baseData, recordData, uid, serverId, contractName = '危機合約', lang = 'zh_Hant', options = {}) {
    const WIDTH = 1920;
    const HEIGHT = 1080;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    applyLangFont(ctx, lang);
    const text = UI_TEXT[lang] || UI_TEXT.zh_Hant;

    const bestRecordBase = baseData?.data?.crisisContract?.history?.bestRecord || {};
    const recordDetail = recordData?.data?.recordDetail || {};

    const charsData = Array.isArray(recordDetail.chars) ? recordDetail.chars : [];
    const indicators = Array.isArray(recordDetail.indicators) ? recordDetail.indicators : [];
    const indicatorIds = Array.isArray(recordDetail.indicatorIds) ? recordDetail.indicatorIds : null;
    const selectedIndicators = indicatorIds
        ? indicators.filter(ind => indicatorIds.includes(ind.id))
        : indicators;

    const indicatorCount = recordDetail.indicatorCount ?? bestRecordBase.indicatorCount ?? 0;
    const passWaveRaw = recordDetail.passWave ?? bestRecordBase.passWave;
    const isPass = recordDetail.isPass ?? bestRecordBase.isPass ?? (Number(passWaveRaw ?? 3) >= 3);
    const isBest = recordDetail.isBest ?? bestRecordBase.isBest ?? false;
    const passWave = Number(passWaveRaw ?? (isPass ? 3 : 0));
    const timeStr = formatDuration(recordDetail.passTs ?? bestRecordBase.passTs ?? 0);

    const charMetaMap = options.charMetaMap || null;
    const getCharMeta = (charId) => {
        if (!charMetaMap || !charId) return null;
        return typeof charMetaMap.get === 'function' ? charMetaMap.get(charId) : charMetaMap[charId];
    };

    const [assets, cardAssetsList] = await Promise.all([
        getPhase2StaticAssets(),
        Promise.all([0, 1, 2, 3].map(i => {
            const charObj = charsData[i] || null;
            const charMeta = charObj ? getCharMeta(charObj.charId) : null;
            return preloadPhase2CardAssets(charObj, charMeta);
        })),
    ]);
    const bgImg = isPass ? assets.successBgImg : assets.failBgImg;

    drawPhase2Background(ctx, WIDTH, HEIGHT, bgImg, isPass);

    const renderTiltedSection = async (box, side, drawFn) => {
        const supersample = 2;
        const offCanvas = createCanvas(box.w * supersample, box.h * supersample);
        const offCtx = offCanvas.getContext('2d');
        applyLangFont(offCtx, lang);
        offCtx.save();
        offCtx.scale(supersample, supersample);
        offCtx.translate(-box.x, -box.y);
        await drawFn(offCtx);
        offCtx.restore();

        const quad = buildInwardPerspectiveQuad(box, side);
        drawPerspectiveQuad(ctx, offCanvas, quad);
    };

    // 左側作戰結算資訊欄（向畫面中央右傾之 3D 透視平面）
    await renderTiltedSection({ x: 96, y: 96, w: 650, h: 760 }, 'left', async (offCtx) => {
        await drawPhase2LeftPanel(offCtx, {
            text,
            indicatorCount,
            timeStr,
            isPass,
            isBest,
            passWave,
            selectedIndicators,
            contractName,
            assets,
        });
    });

    // 右側 4 位幹員卡片群組（縮窄寬度並拉大卡片間距，向畫面中央左傾之 3D 透視平面）
    const charStartX = 1106;
    const charY = 122;
    const charW = 160;
    const charH = 740;
    const charGap = 28;

    await renderTiltedSection({ x: 1084, y: 112, w: 758, h: 760 }, 'right', (offCtx) => {
        for (let i = 0; i < 4; i++) {
            const cx = charStartX + i * (charW + charGap);
            drawPhase2OperatorCard(offCtx, cx, charY, charW, charH, charsData[i] || null, cardAssetsList[i], isPass, assets);
        }
    });

    // 底部浮水印資訊（加上深色陰影以維持在亮黃光暈背景上的可讀性）
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.font = "14px 'Noto Sans TC', sans-serif";
    const serverName = SERVER_ID_TO_NAME[serverId] || serverId || 'Asia';
    ctx.fillText(`UID: ${uid}   Server: ${serverName}`, 40, HEIGHT - 15);

    ctx.textAlign = 'right';
    ctx.fillText(text.assistant, WIDTH - 40, HEIGHT - 15);
    ctx.restore();
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    drawCrisisUI,
    detectCrisisPhase,
};
