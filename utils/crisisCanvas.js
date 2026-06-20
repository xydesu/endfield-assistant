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

/**
 * 根據 Crisis Contract 資料產生圖片 Buffer
 */
async function drawCrisisUI(baseData, recordData, uid, serverId, contractName = '危機合約', lang = 'zh_Hant') {
    const WIDTH = 1920;
    const HEIGHT = 1080;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // 動態切換字型族，適配官服簡體中文 (zh_Hans) 與日文 (ja) 等
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

    const UI_TEXT = {
        zh_Hant: {
            totalIndicators: '指標總計',
            battleDuration: '戰鬥時長',
            assistant: '終末地簽到小助手',
        },
        zh_Hans: {
            totalIndicators: '指标总计',
            battleDuration: '战斗时长',
            assistant: '终末地签到小助手',
        },
        ja: {
            totalIndicators: '合計指標',
            battleDuration: '作戦時間',
            assistant: 'エンドフィールドサインインアシスタント',
        },
        en: {
            totalIndicators: 'Total Indicators',
            battleDuration: 'Time Elapsed',
            assistant: 'Endfield Assistant',
        }
    };

    const text = UI_TEXT[lang] || UI_TEXT.zh_Hant;

    const bestRecordBase = baseData.data.crisisContract.history.bestRecord;
    
    // 使用 recordDetail 裡面的幹員數據與指標
    const charsData = recordData.data.recordDetail.chars || [];
    const indicators = recordData.data.recordDetail.indicators || [];
    const indicatorCount = recordData.data.recordDetail.indicatorCount || 0;

    // 解析行動時長 passTs
    const passTsRaw = bestRecordBase.passTs ? parseInt(bestRecordBase.passTs, 10) : 0;
    const mm = String(Math.floor(passTsRaw / 60)).padStart(2, '0');
    const ss = String(passTsRaw % 60).padStart(2, '0');
    const timeStr = `${mm}:${ss}`;

    // 預先載入武器詞條圖示
    const talentIconPath = path.join(__dirname, '../assets/images/talent/1.png');
    let talentIconImg = null;
    if (fs.existsSync(talentIconPath)) {
        try { talentIconImg = await loadImage(talentIconPath); } catch(e) {}
    }

    // 預先載入指標總計下方圖標
    const indTotalPath = path.join(__dirname, '../assets/images/ui/indicator_total.png');
    let indTotalImg = null;
    if (fs.existsSync(indTotalPath)) {
        try { indTotalImg = await loadImage(indTotalPath); } catch(e) {}
    }

    // 預先載入波次底板
    const waveBgPath = path.join(__dirname, '../assets/images/ui/wave_bg.png');
    let waveBgImg = null;
    if (fs.existsSync(waveBgPath)) {
        try { waveBgImg = await loadImage(waveBgPath); } catch(e) {}
    }

    // 預先載入波次數字圖示
    const waveNumImgs = [];
    for (let i = 1; i <= 4; i++) {
        const wnPath = path.join(__dirname, `../assets/images/ui/wave_${i}.png`);
        if (fs.existsSync(wnPath)) {
            try { waveNumImgs[i - 1] = await loadImage(wnPath); } catch(e) {}
        }
    }

    // 預先載入裝備精段圖示
    const equipRefineImgs = [];
    for (let i = 1; i <= 3; i++) {
        const erPath = path.join(__dirname, `../assets/images/ui/equip_refine_${i}.png`);
        if (fs.existsSync(erPath)) {
            try { equipRefineImgs[i - 1] = await loadImage(erPath); } catch(e) {}
        }
    }

    // 1. 背景繪製
    let bgImg = null;
    const bgPath = path.join(__dirname, '../assets/images/ui/successBg.832099.png');
    if (fs.existsSync(bgPath)) {
        try { bgImg = await loadImage(bgPath); } catch (e) {}
    }

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

    const selectedIndicators = indicators.filter(ind => recordData.data.recordDetail.indicatorIds.includes(ind.id));
    
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

module.exports = {
    drawCrisisUI
};
