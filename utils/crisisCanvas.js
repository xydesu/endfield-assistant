const { registerFont, createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

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

// 註冊思源黑體字型以防不同平台缺字型跑版
function registerLangFont(langCode, familyName) {
    const weights = [
        { file: `NotoSans${langCode}-Regular.ttf`, weight: 'normal' },
        { file: `NotoSans${langCode}-Bold.ttf`, weight: 'bold' },
        { file: `NotoSans${langCode}-Black.ttf`, weight: '900' }
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
} catch (error) {
    console.error('[crisisCanvas] 載入字體時發生錯誤', error);
}

// 輔助函式：繪製圓角矩形
function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle, strokeWidth) {
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
        actionFail: '行動失敗',
        newRecord: '新紀錄',
        sanctumRating: '聖所已予以您的評喻',
        assistant: '終末地簽到小助手',
    },
    zh_Hans: {
        totalIndicators: '指标总计',
        battleDuration: '战斗时长',
        actionDuration: '行动时长',
        indicatorList: '指标一览',
        actionSuccess: '行动成功',
        actionFail: '行动失败',
        newRecord: '新纪录',
        sanctumRating: '圣所已予以您的评喻',
        assistant: '终末地签到小助手',
    },
    ja: {
        totalIndicators: '合計指標',
        battleDuration: '作戦時間',
        actionDuration: '行動時間',
        indicatorList: '指標一覧',
        actionSuccess: '行動成功',
        actionFail: '行動失敗',
        newRecord: '新記録',
        sanctumRating: '聖所からの評価',
        assistant: 'エンドフィールドサインインアシスタント',
    },
    en: {
        totalIndicators: 'Total Indicators',
        battleDuration: 'Time Elapsed',
        actionDuration: 'Time Elapsed',
        indicatorList: 'Indicators',
        actionSuccess: 'OPERATION SUCCESS',
        actionFail: 'OPERATION FAILED',
        newRecord: 'NEW RECORD',
        sanctumRating: 'Sanctum Assessment',
        assistant: 'Endfield Assistant',
    }
};

/**
 * 安全載入本地或遠端圖片，失敗時回傳 null 避免中斷整體渲染
 */
async function safeLoadImage(source) {
    if (!source) return null;
    if (typeof source === 'string' && !source.startsWith('http') && !source.startsWith('data:') && !fs.existsSync(source)) {
        return null;
    }
    try {
        return await loadImage(source);
    } catch (e) {
        return null;
    }
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
 * 依傳入語言切換 Canvas 字型族
 */
function applyLangFont(ctx, lang) {
    const fontMap = {
        'zh_Hant': 'Noto Sans TC',
        'zh_Hans': 'Noto Sans SC',
        'ja': 'Noto Sans JP',
        'en': 'Noto Sans TC'
    };
    const fontFamily = fontMap[lang] || 'Noto Sans TC';

    if (fontFamily !== 'Noto Sans TC') {
        const proto = Object.getPrototypeOf(ctx);
        const desc = Object.getOwnPropertyDescriptor(proto, 'font');
        if (desc && desc.set) {
            Object.defineProperty(ctx, 'font', {
                get() {
                    return desc.get.call(ctx);
                },
                set(val) {
                    const newVal = val.replace(/'Noto Sans TC'/g, `'${fontFamily}'`).replace(/"Noto Sans TC"/g, `"${fontFamily}"`);
                    desc.set.call(ctx, newVal);
                },
                configurable: true,
                enumerable: true
            });
        }
    }
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
            try { iconImg = await loadImage(ind.icon); } catch (e) {}
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
            try { avatarImg = await loadImage(charObj.avatarUrl); } catch (e) {}
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
        
        const rLevel = charObj.weapon ? charObj.weapon.refineLevel : 0;
        const potentialImgPath = path.join(__dirname, '../assets/images/character', `potential_${rLevel}.png`);
        let pImg = null;
        if (fs.existsSync(potentialImgPath)) {
            try { pImg = await loadImage(potentialImgPath); } catch (e) {}
        }
        if (pImg) {
            ctx.drawImage(pImg, cx + 5, weaponY + 10, 45, 45);
        }

        let wIconImg = null;
        if (charObj.weapon && charObj.weapon.icon) {
            try { wIconImg = await loadImage(charObj.weapon.icon); } catch (e) {}
        }
        
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
        const wLevel = charObj.weapon ? charObj.weapon.level : '1';
        ctx.fillText(wLevel.toString(), cx + 32, weaponY + 90);
        
        ctx.fillStyle = '#ffb300';
        ctx.fillRect(cx + 10, weaponY + 100, 70, 4);

        if (charObj.weapon && charObj.weapon.weaponTerms) {
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
                        let eqImg = null;
                        try { eqImg = await loadImage(eqObj.icon); } catch (e) {}
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

    // 左側深色遮罩確保文字可讀性（避免過度遮蔽中央全息基地光柱）
    const leftOverlay = ctx.createLinearGradient(0, 0, WIDTH * 0.44, 0);
    leftOverlay.addColorStop(0, 'rgba(10, 11, 14, 0.72)');
    leftOverlay.addColorStop(0.6, 'rgba(10, 11, 14, 0.22)');
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

    // 左中側微妙斜射虹彩光束（還原實機圖左側紫藍光暈）
    if (isPass) {
        const prismGrad = ctx.createLinearGradient(0, 740, 520, 790);
        prismGrad.addColorStop(0, 'rgba(190, 45, 210, 0.18)');
        prismGrad.addColorStop(0.5, 'rgba(65, 165, 255, 0.14)');
        prismGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = prismGrad;
        ctx.fillRect(0, 725, 520, 55);
    }

    // 底部氛圍光暈（高亮度黃綠光暈）
    const bottomGlow = ctx.createLinearGradient(0, HEIGHT - 300, 0, HEIGHT);
    bottomGlow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomGlow.addColorStop(0.55, isPass ? 'rgba(218, 232, 34, 0.22)' : 'rgba(179, 75, 51, 0.20)');
    bottomGlow.addColorStop(1, isPass ? 'rgba(232, 238, 38, 0.52)' : 'rgba(185, 72, 46, 0.45)');
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(0, HEIGHT - 300, WIDTH, 300);

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
        isBest,
        passWave,
        selectedIndicators,
        contractName,
        assets,
    } = params;

    const panelX = 110;
    const panelW = 620;
    const primaryColor = isPass ? '#e8f522' : '#e05b3f';

    // 1. 行動時長橫條
    const durY = 104;
    const durH = 44;
    const durGrad = ctx.createLinearGradient(panelX, durY, panelX + panelW, durY);
    durGrad.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
    durGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
    ctx.fillStyle = durGrad;
    ctx.fillRect(panelX, durY, panelW, durH);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.actionDuration, panelX + 18, durY + 29);

    ctx.font = "bold 26px 'Noto Sans TC', sans-serif";
    const timeWidth = ctx.measureText(timeStr).width;
    const timeX = panelX + panelW - 18 - timeWidth;
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

    // 3. 指標總計 + [新紀錄] 標籤
    const totalY = 306;
    let labelX = panelX + 10;
    if (assets.indTotalImg) {
        const tintedTotal = tintIcon(assets.indTotalImg, '#ffffff', 24);
        ctx.drawImage(tintedTotal, labelX, totalY - 21, 24, 24);
        labelX += 34;
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 24px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.totalIndicators, labelX, totalY);

    if (isPass && isBest) {
        const titleW = ctx.measureText(text.totalIndicators).width;
        const badgeX = labelX + titleW + 14;
        const badgeY = totalY - 18;
        ctx.font = "bold 15px 'Noto Sans TC', sans-serif";
        const badgeTextW = ctx.measureText(text.newRecord).width;
        const badgeW = Math.ceil(badgeTextW) + 8;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fillRect(badgeX, badgeY, badgeW, 20);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 1;
        ctx.strokeRect(badgeX, badgeY, badgeW, 20);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text.newRecord, badgeX + 4, badgeY + 15);
    }

    // 4. 指標一覽網格 (預設 9 欄 × 2~3 列)
    const listTitleY = 364;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillRect(panelX, listTitleY - 17, 3, 18);
    ctx.fillStyle = 'rgba(235, 238, 242, 0.9)';
    ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.indicatorList, panelX + 12, listTitleY);

    const gridY = listTitleY + 18;
    const cols = 9;
    const cellSize = 60;
    const cellGap = 9;
    const visibleIndicators = selectedIndicators.slice(0, 27);
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
    }

    // 依據實際指標列數推算下方主標題位置，避免 3 列指標時重疊
    const rowsUsed = Math.max(2, Math.ceil(visibleIndicators.length / cols));
    const afterGridY = gridY + rowsUsed * (cellSize + cellGap) + 30;

    // 5. 行動成功 / 行動失敗 + CONTINGENCY CONTRACT INDIGO 徽章
    const statusText = isPass ? text.actionSuccess : text.actionFail;
    ctx.fillStyle = primaryColor;
    ctx.font = "normal 82px 'Noto Sans TC', sans-serif";
    ctx.fillText(statusText, panelX - 2, afterGridY + 70);

    drawPhase2ContractBadge(ctx, panelX + 2, afterGridY + 90, contractName, isPass);

    // 6. 聖所評喻橫幅（1:1 還原實機左側光暈＋實心白 i 徽章與右側帶圖標方框分數）
    const ratingY = afterGridY + 156;
    const ratingH = 54;
    const ratingColors = getPhase2RatingColors(isPass, indicatorCount);
    const bannerFill = 'rgba(20, 22, 26, 0.90)';
    drawRoundedRect(ctx, panelX, ratingY, panelW, ratingH, 2, bannerFill, 'rgba(255, 255, 255, 0.14)', 1);

    const isHighRedTier = !isPass || indicatorCount >= 30;
    const accentStart = isHighRedTier ? '#f05a28' : ratingColors.start;
    const accentEnd = isHighRedTier ? '#d92f2f' : ratingColors.end;

    // 左側柔光暈 + 豎立色條
    const leftGlow = ctx.createLinearGradient(panelX, ratingY, panelX + 95, ratingY);
    leftGlow.addColorStop(0, isHighRedTier ? 'rgba(235, 82, 42, 0.28)' : 'rgba(130, 120, 245, 0.25)');
    leftGlow.addColorStop(1, 'rgba(20, 22, 26, 0)');
    ctx.fillStyle = leftGlow;
    ctx.fillRect(panelX + 1, ratingY + 1, 95, ratingH - 2);

    const barGrad = ctx.createLinearGradient(panelX, ratingY, panelX, ratingY + ratingH);
    barGrad.addColorStop(0, accentStart);
    barGrad.addColorStop(1, accentEnd);
    ctx.fillStyle = barGrad;
    ctx.fillRect(panelX, ratingY + 1, 4, ratingH - 2);

    // 左側白色實心圓形 i 圖示
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(panelX + 34, ratingY + ratingH / 2, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1d22';
    ctx.font = "900 15px 'Noto Sans TC', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('i', panelX + 34, ratingY + ratingH / 2 + 5);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#e5e8ec';
    ctx.font = "bold 21px 'Noto Sans TC', sans-serif";
    ctx.fillText(text.sanctumRating, panelX + 60, ratingY + 35);

    // 右側 1:1 還原直角框體（貼齊內容寬高，暗紅底＋細紅框＋白字分數＋指標總計圖示）
    ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
    const numW = ctx.measureText(scoreStr).width;
    const iconSize = 19;
    const tagPadX = 6;
    const tagGap = 4;
    const tagW = Math.ceil(tagPadX * 2 + numW + tagGap + iconSize);
    const tagH = 24;
    const tagX = panelX + panelW - tagW - 18;
    const tagY = ratingY + (ratingH - tagH) / 2;

    const tagBg = isHighRedTier ? 'rgba(116, 22, 30, 0.75)' : 'rgba(54, 42, 95, 0.72)';
    const tagBorder = isHighRedTier ? 'rgba(232, 86, 72, 0.85)' : ratingColors.end;
    ctx.fillStyle = tagBg;
    ctx.fillRect(tagX, tagY, tagW, tagH);
    ctx.strokeStyle = tagBorder;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(tagX, tagY, tagW, tagH);

    const contentW = numW + tagGap + iconSize;
    const contentStartX = tagX + (tagW - contentW) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
    ctx.fillText(scoreStr, contentStartX, tagY + 19);

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
 * 繪製 Z-4 裝備卡槽左上角懸浮升級徽章（深灰圓角投影底板＋亮天藍六角螺帽與右上三角形）
 */
function drawEquipmentUpgradeBadge(ctx, sx, sy, slotSize) {
    const badgeSize = slotSize * 0.34;
    const badgeRadius = slotSize * 0.08;
    const badgeX = sx - slotSize * 0.08;
    const badgeY = sy - slotSize * 0.08;

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

    // 亮天藍幾何向量圖示（#29B6F6）
    ctx.save();
    const iconColor = '#29B6F6';
    const hexCx = badgeX + badgeSize * 0.40;
    const hexCy = badgeY + badgeSize * 0.58;
    const hexR = badgeSize * 0.24;

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

    // 右上角外側緊鄰實心小三角形（尖端朝右上，與六角形保持清晰間距）
    const tipX = badgeX + badgeSize * 0.90;
    const tipY = badgeY + badgeSize * 0.10;
    ctx.fillStyle = iconColor;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - badgeSize * 0.25, tipY + badgeSize * 0.07);
    ctx.lineTo(tipX - badgeSize * 0.07, tipY + badgeSize * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/**
 * 局部重構：扁平工業風＋多層次錯位 2×2 裝備區塊（使用獨立局部座標隔離狀態）
 */
function drawPhase2EquipmentSection(ctx, sectionX, sectionY, sectionW, charObj, cardAssets, assets) {
    ctx.save();
    ctx.translate(sectionX, sectionY);

    const slotSize = 68;
    const slotGap = 16;
    const gridW = slotSize * 2 + slotGap;
    const gridX = Math.floor((sectionW - gridW) / 2);
    const railW = gridW + 8;
    const railX = gridX - 4;

    // 頂部分隔導軌（霧灰色橫槓，對齊裝備區左右邊界）
    ctx.fillStyle = '#4D4D4D';
    ctx.fillRect(railX, 0, railW, 2.5);

    const gridY = 13;
    const eqKeys = ['bodyEquip', 'armEquip', 'firstAccessory', 'secondAccessory'];

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

            // Z-2 錯位稀有度色塊（88% 尺寸嚴格貼齊外框上邊與右邊，左與底留出深色 L 型縫隙）
            const innerSize = slotSize * 0.88;
            const innerX = sx + slotSize - innerSize;
            const innerY = sy;
            ctx.fillStyle = getRarityColor(eqObj, '#E6A800', EQUIP_BLOCK_RARITY_COLORS);
            ctx.fillRect(innerX, innerY, innerSize, innerSize);

            // Z-1 最外層定位線框（淺灰銳角實線框壓在色塊外緣，確保上與右邊緣無黑色縫隙）
            ctx.strokeStyle = '#6E6E6E';
            ctx.lineWidth = 1.8;
            ctx.strokeRect(sx, sy, slotSize, slotSize);

            // Z-3 前景裝備立繪（放大至 92% 並向右下角偏移 14%，自然壓過灰框右線與底線）
            const targetSize = slotSize * 0.92;
            const scale = Math.min(targetSize / eqImg.width, targetSize / eqImg.height);
            const ew = eqImg.width * scale;
            const eh = eqImg.height * scale;
            const offsetX = slotSize * 0.14;
            const offsetY = slotSize * 0.14;
            ctx.drawImage(eqImg, sx + (slotSize - ew) / 2 + offsetX, sy + (slotSize - eh) / 2 + offsetY, ew, eh);

            // Z-4 左上角懸浮升級徽章（依專案裝備升級次數欄位與已載入素材狀態顯示）
            const enhanceCount = Number(eqObj.enhanceStatus ?? eqObj.upgradeCount ?? 0);
            const hasCachedEnhanceAsset = Array.isArray(assets.enhanceImgs)
                && enhanceCount >= 1
                && Boolean(assets.enhanceImgs[Math.min(enhanceCount, assets.enhanceImgs.length) - 1]);
            if (enhanceCount >= 1 && (hasCachedEnhanceAsset || !assets.enhanceImgs?.length)) {
                drawEquipmentUpgradeBadge(ctx, sx, sy, slotSize);
            }
        }
    }

    ctx.restore();
}

/**
 * 繪製 Phase 2 單張幹員出戰卡片（同步繪製以隔離 ctx.clip() 狀態）
 */
function drawPhase2OperatorCard(ctx, cx, cy, cw, ch, charObj, cardAssets, isPass, assets) {
    drawRoundedRect(ctx, cx, cy, cw, ch, 2, 'rgba(13, 15, 19, 0.88)', 'rgba(255, 255, 255, 0.10)', 1);

    // 幹員頂部色條依據幹員 rarity 著色，缺乏資料時退回通關/失敗主題色
    const topAccent = getRarityColor(charObj, isPass ? '#d8e622' : '#b34b33');
    ctx.fillStyle = topAccent;
    ctx.fillRect(cx, cy, cw, 5);

    if (!charObj || !cardAssets) return;

    const portraitH = 388;

    // (A) 幹員半身立繪
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy + 5, cw, portraitH);
    ctx.clip();

    if (cardAssets.avatarImg) {
        const avatarImg = cardAssets.avatarImg;
        const scale = Math.max((cw + 40) / avatarImg.width, portraitH / avatarImg.height);
        const dw = avatarImg.width * scale;
        const dh = avatarImg.height * scale;
        ctx.drawImage(avatarImg, cx + (cw - dw) / 2, cy + 16, dw, dh);
    } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(cx, cy + 5, cw, portraitH);
    }

    if (assets.charTopMaskImg) {
        ctx.drawImage(assets.charTopMaskImg, cx, cy + 5, cw, 90);
    }
    ctx.restore();

    // 立繪底部過渡漸層
    const fadeGrad = ctx.createLinearGradient(cx, cy + portraitH - 110, cx, cy + portraitH + 10);
    fadeGrad.addColorStop(0, 'rgba(13, 15, 19, 0)');
    fadeGrad.addColorStop(1, 'rgba(13, 15, 19, 0.96)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(cx, cy + portraitH - 110, cw, 120);

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
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 9;
        ctx.shadowOffsetY = 1;
        ctx.drawImage(cardAssets.potImg, cx + 8, potY, 44, 44);
        ctx.restore();
    }

    // (B) 武器區域
    const weaponY = cy + 404;
    const weaponH = 128;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.fillRect(cx, weaponY, cw, weaponH);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(cx, weaponY, cw, 1);

    if (cardAssets.wIconImg) {
        const wIconImg = cardAssets.wIconImg;
        const maxW = 116;
        const maxH = 112;
        const scale = Math.min(maxW / wIconImg.width, maxH / wIconImg.height);
        const ww = wIconImg.width * scale;
        const wh = wIconImg.height * scale;
        ctx.drawImage(wIconImg, cx + 4 + (maxW - ww) / 2, weaponY + 4 + (maxH - wh) / 2, ww, wh);
    }

    // 武器精煉等級圖示（與幹員命座同款，無外框加陰影）
    if (cardAssets.wRefineImg) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.92)';
        ctx.shadowBlur = 6;
        ctx.drawImage(cardAssets.wRefineImg, cx + 8, weaponY + 8, 30, 30);
        ctx.restore();
    }

    const wLevel = charObj.weapon?.level ?? 1;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.font = "bold 12px 'Noto Sans TC', sans-serif";
    ctx.fillText('Lv.', cx + 10, weaponY + 112);
    ctx.fillStyle = '#ffffff';
    ctx.font = "900 28px 'Noto Sans TC', sans-serif";
    ctx.fillText(String(wLevel), cx + 30, weaponY + 112);
    ctx.restore();

    // 武器下方稀有度色條（依據 weapon.rarity 變色）
    ctx.fillStyle = getRarityColor(charObj.weapon, '#f5b800');
    ctx.fillRect(cx + 4, weaponY + weaponH - 4, 114, 4);

    // 武器詞條（/9 /9 /4 樣式＋貼合字體寬高之斜切幾何背景底塊）
    const terms = Array.isArray(charObj.weapon?.weaponTerms) ? charObj.weapon.weaponTerms : [];
    for (let t = 0; t < Math.min(terms.length, 3); t++) {
        const ty = weaponY + 14 + t * 34;
        const tx = cx + cw - 42;
        const termStr = String(terms[t]);
        ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
        const numWidth = ctx.measureText(termStr).width;
        const bgW = Math.ceil(22 + numWidth);
        drawSkewedRect(ctx, tx - 5, ty, bgW, 21, 4, 'rgba(255, 255, 255, 0.22)');
        drawSkewedRect(ctx, tx - 5, ty, 3, 21, 4, 'rgba(232, 245, 34, 0.85)');
        if (assets.termSlashImg) {
            ctx.drawImage(assets.termSlashImg, tx, ty + 2, 13, 18);
        } else {
            ctx.fillStyle = '#e8f522';
            ctx.font = "900 18px 'Noto Sans TC', sans-serif";
            ctx.fillText('/', tx, ty + 18);
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = "bold 20px 'Noto Sans TC', sans-serif";
        ctx.fillText(termStr, tx + 14, ty + 18);
    }

    // (C) 2×2 裝備區塊（局部座標隔離＋扁平工業風多層次錯位渲染）
    drawPhase2EquipmentSection(ctx, cx, weaponY + weaponH + 8, cw, charObj, cardAssets, assets);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(cx, cy + ch - 2, cw, 2);
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
    const isPass = recordDetail.isPass ?? bestRecordBase.isPass ?? true;
    const isBest = recordDetail.isBest ?? bestRecordBase.isBest ?? false;
    const passWave = Number(recordDetail.passWave ?? bestRecordBase.passWave ?? (isPass ? 3 : 0));
    const timeStr = formatDuration(recordDetail.passTs ?? bestRecordBase.passTs ?? 0);

    const charMetaMap = options.charMetaMap || null;
    const getCharMeta = (charId) => {
        if (!charMetaMap || !charId) return null;
        return typeof charMetaMap.get === 'function' ? charMetaMap.get(charId) : charMetaMap[charId];
    };

    const phase2Dir = path.join(__dirname, '../assets/images/ui/phase2');
    const [
        bgImg,
        clockImg,
        indTotalImg,
        waveFailImg,
        termSlashImg,
        charTopMaskImg,
        ...restImgs
    ] = await Promise.all([
        safeLoadImage(path.join(phase2Dir, isPass ? 'success_bg.png' : 'fail_bg.png')),
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
    ]);

    const cardAssetsList = await Promise.all([0, 1, 2, 3].map(i => {
        const charObj = charsData[i] || null;
        const charMeta = charObj ? getCharMeta(charObj.charId) : null;
        return preloadPhase2CardAssets(charObj, charMeta);
    }));

    const assets = {
        clockImg,
        indTotalImg,
        waveFailImg,
        termSlashImg,
        charTopMaskImg,
        waveImgs: restImgs.slice(0, 3),
        enhanceImgs: restImgs.slice(3, 6),
    };

    drawPhase2Background(ctx, WIDTH, HEIGHT, bgImg, isPass);

    await drawPhase2LeftPanel(ctx, {
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

    // 右側 4 位幹員卡片（循序繪製以確保裁切區域互不干擾）
    const charStartX = 1098;
    const charY = 122;
    const charW = 178;
    const charH = 740;
    const charGap = 10;

    for (let i = 0; i < 4; i++) {
        const cx = charStartX + i * (charW + charGap);
        drawPhase2OperatorCard(ctx, cx, charY, charW, charH, charsData[i] || null, cardAssetsList[i], isPass, assets);
    }

    // 底部浮水印資訊
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = "14px 'Noto Sans TC', sans-serif";
    const serverName = SERVER_ID_TO_NAME[serverId] || serverId || 'Asia';
    ctx.fillText(`UID: ${uid}   Server: ${serverName}`, 40, HEIGHT - 15);

    ctx.textAlign = 'right';
    ctx.fillText(text.assistant, WIDTH - 40, HEIGHT - 15);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    drawCrisisUI,
    detectCrisisPhase,
};
