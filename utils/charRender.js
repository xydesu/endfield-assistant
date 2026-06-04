const { registerFont, createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { toTraditional } = require('./toTraditional');

// 輔助函數：從網路下載檔案
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const file = fs.createWriteStream(dest);
        let isAborted = false;

        const request = https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`下載失敗，狀態碼: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        });

        request.on('error', (err) => {
            isAborted = true;
            fs.unlink(dest, () => reject(err));
        });

        request.setTimeout(10000, () => {
            if (!isAborted) {
                request.destroy();
                reject(new Error('下載超時 (10s)'));
            }
        });
    });
}

// 輔助函數：解析圖片路徑 (自動處理網路 URL 下載快取，零硬編碼對接)
async function resolveImagePath(urlOrPath) {
    if (!urlOrPath) return null;
    
    // 如果是網路 URL
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
        let filename;
        try {
            const parsedUrl = new URL(urlOrPath);
            const pathname = parsedUrl.pathname;
            filename = pathname.substring(pathname.lastIndexOf('/') + 1);
        } catch (e) {
            filename = urlOrPath.substring(urlOrPath.lastIndexOf('/') + 1);
        }

        if (!filename) {
            filename = `img_${Date.now()}`;
        }
        
        // 所有動態資源皆平鋪放置於 assets/images/dynamic/
        const localRelPath = `assets/images/dynamic/${filename}`;
        const localAbsPath = path.join(__dirname, '..', localRelPath);
        
        // 檢查本地檔案是否存在，不存在則下載
        if (!fs.existsSync(localAbsPath)) {
            console.log(`[下載中] 偵測到新資源，開始下載: ${urlOrPath}`);
            try {
                await downloadFile(urlOrPath, localAbsPath);
                console.log(`[下載成功] 資源已存入: ${localRelPath}`);
            } catch (e) {
                console.error(`[下載失敗] 無法下載 ${urlOrPath}，將嘗試返回原始網址`, e);
                return urlOrPath;
            }
        }
        return localRelPath;
    }
    
    return urlOrPath;
}


// 註冊本地多語言 Noto Sans 字型，確保字型與排版跨平台 100% 像素級一致
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
        } else {
            console.warn(`[charRender] 找不到字體檔案: ${file}`);
        }
    }
}

try {
    registerLangFont('TC', 'Noto Sans TC');
    registerLangFont('SC', 'Noto Sans SC');
    registerLangFont('JP', 'Noto Sans JP');
} catch (error) {
    console.error('[charRender] 載入字體時發生錯誤', error);
}

// 輔助函數：繪製圓角矩形
function drawRoundRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle, strokeWidth) {
    ctx.beginPath();
    if (radius === 0) {
        ctx.rect(x, y, width, height);
    } else {
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
    }
    ctx.closePath();

    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (strokeStyle && strokeWidth) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
    }
}

// 輔助函數：啟用投影
function enableShadow(ctx) {
    ctx.shadowColor = 'rgba(26, 26, 26, 0.05)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
}

// 輔助函數：關閉投影
function disableShadow(ctx) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

// 輔助函數：繪製五角星
function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius, fillStyle) {
    let rot = Math.PI / 2 * 3;
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
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
}

// 輔助函數：繪製天賦火焰
function drawFlame(ctx, x, y, size, fillStyle, strokeStyle, strokeWidth) {
    ctx.beginPath();
    const r = size / 2;
    const cx = x + r;
    const cy = y + r;
    ctx.moveTo(cx, cy + r * 0.9);
    ctx.bezierCurveTo(cx - r * 0.8, cy + r * 0.9, cx - r * 0.9, cy + r * 0.2, cx - r * 0.2, cy - r * 0.5);
    ctx.bezierCurveTo(cx - r * 0.5, cy - r * 0.1, cx - r * 0.4, cy + r * 0.3, cx, cy + r * 0.2);
    ctx.bezierCurveTo(cx + r * 0.3, cy - r * 0.4, cx, cy - r * 0.9, cx + r * 0.1, cy - r * 0.9);
    ctx.bezierCurveTo(cx + r * 0.8, cy - r * 0.4, cx + r * 0.8, cy + r * 0.2, cx + r * 0.6, cy + r * 0.6);
    ctx.bezierCurveTo(cx + r * 0.4, cy + r * 0.9, cx + r * 0.1, cy + r * 0.9, cx, cy + r * 0.9);
    ctx.closePath();
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }
    if (strokeStyle && strokeWidth) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
    }
}

// 輔助函數：繪製四角星
function drawSparkles(ctx, x, y, size, fillStyle) {
    ctx.beginPath();
    const r = size / 2;
    const cx = x + r;
    const cy = y + r;
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx, cy, cx + r, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx - r, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy - r);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
}

// 輔助函數：繪製天賦節點右下角的斜圓角小膠囊
function drawTiltCapsule(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4); // 旋轉 45 度
    // 畫一個 3x8 的圓角矩形，填滿白色，描灰色框線
    drawRoundRect(ctx, -1.5, -4, 3, 8, 1.5, '#FFFFFF', '#AEB4BA', 0.8);
    ctx.restore();
}

// 輔助函數：將圖片像素與目標顏色混合染色，同時保留原始紋理亮度明暗
function tintImage(img, color) {
    const offscreen = createCanvas(img.width, img.height);
    const oCtx = offscreen.getContext('2d');
    oCtx.drawImage(img, 0, 0);
    oCtx.globalCompositeOperation = 'source-in';
    oCtx.fillStyle = color;
    oCtx.fillRect(0, 0, img.width, img.height);
    return offscreen;
}

// 輔助函數：8 方向偏移描邊繪製法，在保留灰白色原色的前提下增強純白背景上的對比度
function drawImageWithOutline(ctx, img, x, y, w, h, outlineColor, outlineWidth) {
    const tinted = tintImage(img, outlineColor);
    ctx.save();
    for (let dx = -outlineWidth; dx <= outlineWidth; dx += outlineWidth) {
        for (let dy = -outlineWidth; dy <= outlineWidth; dy += outlineWidth) {
            if (dx === 0 && dy === 0) continue;
            ctx.drawImage(tinted, x + dx, y + dy, w, h);
        }
    }
    ctx.restore();
    ctx.drawImage(img, x, y, w, h);
}



// 輔助函數：根據天賦名稱獲取各個等級進度節點對應的 iconUrl 本地檔名列表（長度與匹配項目數相同）
function getTalentNodeIcons(talentName, charData) {
    const nameKey = talentName.replace(/·[βγ]$/, '');
    const list = [
        ...(charData.abilityTalents || []),
        ...(charData.combatTalents || []),
        ...(charData.cultivationTalents || [])
    ];
    const matched = list.filter(t => toTraditional(t.name).includes(toTraditional(nameKey)));
    matched.sort((a, b) => a.id.localeCompare(b.id));
    return matched.map(t => {
        if (t.iconUrl) {
            return t.iconUrl.substring(t.iconUrl.lastIndexOf('/') + 1);
        }
        return null;
    });
}

// 輔助函數：將天賦陣列依據去除字尾後的名稱進行分組與排序，實現完全資料驅動
function groupTalents(talents) {
    if (!talents || talents.length === 0) return [];
    const groups = {};
    for (const t of talents) {
        // 去除如 ·β 或 ·γ 或 ·alpha 等字尾，取得基礎天賦名稱
        const baseName = t.name.replace(/·[αβγ]$/i, '').replace(/·(?:alpha|beta|gemma|gamma)$/i, '').trim();
        if (!groups[baseName]) {
            groups[baseName] = [];
        }
        groups[baseName].push(t);
    }
    // 依據組內最小 id 排序，以保證順序的穩定性
    return Object.keys(groups)
        .map(name => {
            const list = groups[name];
            list.sort((a, b) => a.id.localeCompare(b.id));
            return {
                name: name,
                nodes: list
            };
        })
        .sort((a, b) => a.nodes[0].id.localeCompare(b.nodes[0].id));
}

const ELEMENT_COLORS = {
    char_property_physical: '#888888',
    char_property_fire:     '#FF623D',
    char_property_pulse:    '#FFC000',
    char_property_cryst:    '#21C6D0',
    char_property_natural:  '#9EDA23',
};

const TALENT_BADGE_BBOX = {
    '1.png':       [45, 1, 76, 32],
    '1_empty.png': [38, 17, 70, 49],
    '2.png':       [30, 0, 65, 21],
    '2_empty.png': [27, 17, 81, 49],
    '3.png':       [24, 1, 98, 32],
    '3_empty.png': [17, 17, 91, 49],
    '4.png':       [2, 1, 98, 32],
    '4_empty.png': [6, 17, 102, 49]
};

async function renderCharacter(charData, lang = 'zh_Hant') {
    // 1. 建立畫布：1920x1200
    const width = 1920;
    const height = 1200;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 2. 使用傳入的 charData 數據
    const data = charData;

    // 獲取角色屬性主題色 (火系萊萬汀對應 #FF623D)
    const charPropertyKey = data.charData.property.key;
    const themeColor = ELEMENT_COLORS[charPropertyKey] || '#FF623D';

    // 3. 收集並預載入所有需要的圖片資源，消除繪製時的非同步 await，防止 clip/save/restore 狀態混亂
    const imageCache = new Map();
    const pathsToLoad = [
        'assets/images/ui/rarity_star.png',
        'assets/images/ui/bg.413ee1.png',
        'assets/images/ui/bg-banner.png',
        'assets/images/talent/abilityTalents.png',
        'assets/images/talent/combatTalents.png',
        'assets/images/talent/cultivationTalents.png',
        'assets/images/talent/alpha.png',
        'assets/images/talent/beta.png',
        'assets/images/talent/gemma.png',
        'assets/images/equipment/bodyEquip.png',
        'assets/images/equipment/armEquip.png',
        'assets/images/equipment/firstAccessory.png',
        'assets/images/equipment/secondAccessory.png',
        'assets/images/equipment/tacticalItem.png',
        'assets/images/talent/1.png',
        'assets/images/talent/1_empty.png',
        'assets/images/talent/2.png',
        'assets/images/talent/2_empty.png',
        'assets/images/talent/3.png',
        'assets/images/talent/3_empty.png',
        'assets/images/talent/4.png',
        'assets/images/talent/4_empty.png'
    ];

    // 動態收集角色職業與屬性圖標
    if (data.charData.profession && data.charData.profession.key) {
        pathsToLoad.push(`assets/images/character/${data.charData.profession.key}.png`);
    }
    if (data.charData.property && data.charData.property.key) {
        pathsToLoad.push(`assets/images/character/${data.charData.property.key}_active.png`);
    }

    // 動態收集養成/潛能徽章
    const evolvePhase = data.evolvePhase || 0;
    const potentialLevel = data.potentialLevel || 0;
    pathsToLoad.push(`assets/images/character/evolve_${evolvePhase}.png`);
    pathsToLoad.push(`assets/images/character/potential_${potentialLevel}.png`);

    // 動態收集並非同步解析 URL 資源
    const urlsToResolve = [];
    
    // 1. 角色立繪
    if (data.charData.illustrationUrl) {
        urlsToResolve.push(data.charData.illustrationUrl);
    }
    // 2. 武器插圖
    if (data.weapon && data.weapon.weaponData && data.weapon.weaponData.iconUrl) {
        urlsToResolve.push(data.weapon.weaponData.iconUrl);
    }
    // 3. 寶石核心
    if (data.weapon && data.weapon.gem && data.weapon.gem.gemData && data.weapon.gem.gemData.icon) {
        urlsToResolve.push(data.weapon.gem.gemData.icon);
    }
    // 4. 裝備大圖
    if (data.bodyEquip && data.bodyEquip.equipData && data.bodyEquip.equipData.iconUrl) {
        urlsToResolve.push(data.bodyEquip.equipData.iconUrl);
    }
    if (data.armEquip && data.armEquip.equipData && data.armEquip.equipData.iconUrl) {
        urlsToResolve.push(data.armEquip.equipData.iconUrl);
    }
    if (data.firstAccessory && data.firstAccessory.equipData && data.firstAccessory.equipData.iconUrl) {
        urlsToResolve.push(data.firstAccessory.equipData.iconUrl);
    }
    if (data.secondAccessory && data.secondAccessory.equipData && data.secondAccessory.equipData.iconUrl) {
        urlsToResolve.push(data.secondAccessory.equipData.iconUrl);
    }
    if (data.tacticalItem && data.tacticalItem.tacticalItemData && data.tacticalItem.tacticalItemData.iconUrl) {
        urlsToResolve.push(data.tacticalItem.tacticalItemData.iconUrl);
    }
    // 5. 技能圖示
    const skills = data.charData.skills || [];
    for (const s of skills) {
        if (s.iconUrl) {
            urlsToResolve.push(s.iconUrl);
        }
    }
    // 6. 天賦圖示
    const allTalentsList = [
        ...(data.charData.abilityTalents || []),
        ...(data.charData.combatTalents || []),
        ...(data.charData.cultivationTalents || [])
    ];
    for (const t of allTalentsList) {
        if (t.iconUrl) {
            urlsToResolve.push(t.iconUrl);
        }
    }

    // 順序解析所有 URL，下載快取後放入載入列表
    for (const url of urlsToResolve) {
        const resolvedPath = await resolveImagePath(url);
        if (resolvedPath) {
            pathsToLoad.push(resolvedPath);
        }
    }

    // 7. 寶石底板
    if (data.weapon && data.weapon.gem && data.weapon.gem.gemData) {
        const gemRarity = data.weapon.gem.gemData.rarity || 5;
        pathsToLoad.push(`assets/images/gem/item_gem_rarity_${gemRarity}.png`);
    }

    // 8. 武器類型圖標
    if (data.weapon && data.weapon.weaponData && data.weapon.weaponData.type) {
        const wpnTypeKey = data.weapon.weaponData.type.key || 'weapon_type_sword';
        pathsToLoad.push(`assets/images/weapon/${wpnTypeKey}.png`);
    }

    // 併發載入所有唯一的圖片路徑
    const uniquePaths = Array.from(new Set(pathsToLoad));
    await Promise.all(uniquePaths.map(async (relPath) => {
        const isUrl = relPath.startsWith('http://') || relPath.startsWith('https://');
        const absPath = isUrl ? relPath : path.join(__dirname, '..', relPath);
        try {
            if (isUrl || fs.existsSync(absPath)) {
                const img = await loadImage(absPath);
                imageCache.set(relPath, img);
            }
        } catch (e) {
            console.error(`預載入圖片失敗: ${relPath}`, e);
        }
    }));

    // 同步獲取圖片 helper 函數
    function getImage(relPath, fallbackRelPath = null) {
        const isRemote = (p) => p && (p.startsWith('http://') || p.startsWith('https://'));
        const normPath = relPath && !relPath.startsWith('assets/') && !isRemote(relPath) ? 'assets/' + relPath : relPath;
        const normFallback = fallbackRelPath && !fallbackRelPath.startsWith('assets/') && !isRemote(fallbackRelPath) ? 'assets/' + fallbackRelPath : fallbackRelPath;
        if (imageCache.has(normPath)) {
            return imageCache.get(normPath);
        }
        if (normFallback && imageCache.has(normFallback)) {
            return imageCache.get(normFallback);
        }
        return null;
    }

    // 4. 繪製背景底色
    ctx.fillStyle = '#F7F8FA';
    ctx.fillRect(0, 0, width, height);

    const starImg = getImage('images/ui/rarity_star.png');

    // ==========================================
    // A. 左側區域 (Carbon Frost Technical Panel, x: 103, y: 50, w: 650, h: 1100)
    // ==========================================
    const leftX = 103;
    const leftY = 50;
    const leftW = 650;
    const leftH = 1100;

    // 繪製左側卡片背景 (含投影)
    enableShadow(ctx);
    drawRoundRect(ctx, leftX, leftY, leftW, leftH, 16, '#FFFFFF', '#EEF0F2', 2);
    disableShadow(ctx);

    // A1. 頂部橘色細線 (Header Accent Rule, x: 45, y: 71, w: 560, h: 2)
    ctx.fillStyle = themeColor;
    ctx.fillRect(leftX + 45, leftY + 71, 560, 2);

    // A2. 職業圖示框 (Profession Box, x: 45, y: 110, w: 96, h: 96) 及突擊圖示，改為直角框以還原設計稿
    const profBoxX = leftX + 45;
    const profBoxY = leftY + 110;
    drawRoundRect(ctx, profBoxX, profBoxY, 96, 96, 0, '#1A1A1ACC', '#EEF0F280', 1.5);
    const profIcon = getImage(`images/character/${data.charData.profession.key}.png`);
    if (profIcon) {
        ctx.drawImage(profIcon, profBoxX + 6, profBoxY + 6, 84, 84);
    }

    // 繪製突擊框底部的橘色小職業標籤 (x: 164, y: 236, w: 64, h: 22, cornerRadius: 4)
    const profTagX = leftX + 61;
    const profTagY = leftY + 186;
    drawRoundRect(ctx, profTagX, profTagY, 64, 22, 4, themeColor);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "bold 14px 'Noto Sans TC'";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toTraditional(data.charData.profession.value), profTagX + 32, profTagY + 11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // A3. 角色名字「萊萬汀」 (Character Name, x: 150, y: 107)
    ctx.fillStyle = '#1A1A1A';
    ctx.font = "900 58px 'Noto Sans TC'";
    ctx.textBaseline = 'top';
    ctx.fillText(toTraditional(data.charData.name), leftX + 150, leftY + 107);

    // A4. 屬性與星級橫列 (Property & Rarity Row, x: 146, y: 174, w: 259, h: 32)
    const propRowX = leftX + 146;
    const propRowY = leftY + 174;

    // 屬性方框 (32x32)
    drawRoundRect(ctx, propRowX, propRowY, 32, 32, 4, themeColor);
    const propIcon = getImage(`images/character/${data.charData.property.key}_active.png`);
    if (propIcon) {
        ctx.drawImage(propIcon, propRowX + 4, propRowY + 4, 24, 24);
    }

    // 動態計算幹員星級 (使用 8 方向描邊法勾勒灰白色星星)
    const rarityVal = parseInt(data.charData?.rarity?.value) || 6;
    if (starImg) {
        const starStartX = propRowX + 32 + 10;
        for (let i = 0; i < rarityVal; i++) {
            drawImageWithOutline(ctx, starImg, starStartX + i * 36, propRowY + 3, 26, 26, '#AEB4BA', 1);
        }
    }

    // A5. Level Block (x: 405, y: 99, w: 200, h: 131)
    const lvlBlockX = leftX + 405;
    const lvlBlockY = leftY + 99;

    drawRoundRect(ctx, lvlBlockX, lvlBlockY, 200, 131, 12, '#F7F8FA', '#EEF0F2', 1);

    // 動態等級與 "LEVEL" 文字 (依設計稿位置對齊)
    ctx.fillStyle = '#1A1A1A';
    ctx.font = "bold 30px 'Noto Sans TC'";
    ctx.textBaseline = 'top';
    ctx.fillText(String(data.level || 1), lvlBlockX + 14, lvlBlockY + 12);
    
    ctx.font = "bold 21px 'Noto Sans TC'";
    ctx.fillText("LEVEL", lvlBlockX + 51, lvlBlockY + 20);

    // 底部徽章：Elite 與 Potential (放至 75x75)，中間有灰色分隔線
    const evolve = getImage(`images/character/evolve_${data.evolvePhase || 0}.png`);
    if (evolve) {
        ctx.drawImage(evolve, lvlBlockX + 14, lvlBlockY + 46, 75, 75);
    }

    ctx.strokeStyle = '#D9DEE3';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lvlBlockX + 101, lvlBlockY + 58);
    ctx.lineTo(lvlBlockX + 101, lvlBlockY + 108);
    ctx.stroke();

    const potential = getImage(`images/character/potential_${data.potentialLevel || 0}.png`);
    if (potential) {
        ctx.drawImage(potential, lvlBlockX + 114, lvlBlockY + 46, 74, 75);
    }

    // A6. 動態角色標籤 (Role Tag Row, x: 45, y: 242, w: 560, h: 42, gap: 10)
    const tagRowX = leftX + 45;
    const tagRowY = leftY + 242;
    const tags = data.charData.tags || ["大量傷害", "燃燒"];
    let curTagX = tagRowX;

    ctx.textBaseline = 'top';
    ctx.font = "bold 18px 'Noto Sans TC'";

    for (const tag of tags) {
        const tagText = toTraditional(tag);
        const textW = ctx.measureText(tagText).width;
        const tagW = 8 + 8 + textW + 28;
        
        // 畫標籤背景與框線
        drawRoundRect(ctx, curTagX, tagRowY, tagW, 36, 4, '#FFFFFF', '#EEF0F2', 1);
        
        // 畫橘色小方塊 (8x8)
        ctx.fillStyle = themeColor;
        ctx.fillRect(curTagX + 14, tagRowY + 14, 8, 8);

        // 畫標籤文字，使用 middle 對齊以實現完美上下置中
        ctx.fillStyle = '#1A1A1A';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, curTagX + 30, tagRowY + 18);
        ctx.textBaseline = 'top';

        curTagX += tagW + 10;
    }

    // A7. 立繪區域 (Portrait Bay, x: 45, y: 300, w: 560, h: 672)
    const portraitBayX = leftX + 45;
    const portraitBayY = leftY + 300;
    const portraitBayW = 560;
    const portraitBayH = 672;

    ctx.save();
    ctx.beginPath();
    ctx.rect(portraitBayX, portraitBayY, portraitBayW, portraitBayH);
    ctx.clip();

    // 載入立繪背景
    const bgMap = getImage('images/ui/bg.413ee1.png');
    if (bgMap) {
        ctx.drawImage(bgMap, portraitBayX, portraitBayY, portraitBayW, portraitBayH);
    }

    // 載入立繪條幅 (修正高為 493 像素以對齊設計稿)
    const banner = getImage('images/ui/bg-banner.png');
    if (banner) {
        ctx.drawImage(banner, portraitBayX + portraitBayW - 147, portraitBayY, 147, 493);
    }

    // 載入立繪
    const portraitPath = await resolveImagePath(data.charData.illustrationUrl);
    const portrait = getImage(portraitPath);
    if (portrait) {
        ctx.drawImage(portrait, portraitBayX, portraitBayY - 2, portraitBayW, portraitBayH);
    }

    ctx.restore();

    // A8. 底部技能列 (Bottom Skill Row, x: 45, y: 990, w: 560, h: 110)
    const skillRowX = leftX + 45;
    const skillRowY = leftY + 990;
    const skillRowW = 560;

    // 頂部分隔線 (畫在 Y = 1025 處)
    ctx.fillStyle = '#EEF0F2';
    ctx.fillRect(leftX + 45, leftY + 975, 560, 1.5);

    // 均勻四等分垂直排版
    const gap = 560 / 4;
    const cy = leftY + 1008; // 技能圓心 Y 座標 (絕對座標 1058)

    for (let i = 0; i < Math.min(skills.length, 4); i++) {
        const s = skills[i];
        const cx = leftX + 45 + gap * i + gap / 2; // 技能圓心 X 座標

        // 獲取技能等級 (對照 userSkills)
        const userSkill = data.userSkills && data.userSkills[s.id];
        const skillLevel = userSkill ? userSkill.level : 1;

        // 1. 圓形裝飾框
        if (i === 3) {
            // 黃昏技能額外繪製橘紅圓環
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(cx, cy, 27.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.closePath();
        } else {
            // 深灰色外環
            ctx.strokeStyle = '#AEB4BA';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, 27, 0, Math.PI * 2);
            ctx.stroke();
            ctx.closePath();
            
            // 淺灰色內環
            ctx.strokeStyle = '#EEF0F2';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, 25, 0, Math.PI * 2);
            ctx.stroke();
            ctx.closePath();
        }

        // 2. 圓形剪裁與手繪背景繪製技能圖示
        const sPath = await resolveImagePath(s.iconUrl);
        const skillImg = getImage(sPath, 'images/character/potential_1.png');
        
        if (skillImg) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, 24, 0, Math.PI * 2);
            ctx.clip();

            // 根據技能類型繪製背景
            if (i < 3) {
                // 普通技能：深灰色底色
                ctx.fillStyle = '#4A4C50';
                ctx.fillRect(cx - 24, cy - 24, 48, 48);
                // 橘紅色圓弧山丘
                ctx.beginPath();
                ctx.arc(cx, cy + 26, 28, 0, Math.PI * 2);
                ctx.fillStyle = themeColor;
                ctx.fill();
                ctx.closePath();
            } else {
                // 終結技：純橘紅色底色
                ctx.fillStyle = themeColor;
                ctx.fillRect(cx - 24, cy - 24, 48, 48);
            }

            // 將技能圖示染色為純白色，並在中心繪製 (36x36 尺寸)
            const tintedSkill = tintImage(skillImg, '#FFFFFF');
            ctx.drawImage(tintedSkill, cx - 18, cy - 18, 36, 36);

            ctx.restore();
        }

        // 3. 根據技能等級決定灰色專精膠囊內顯示圓點或 RANK 文字
        const capsuleW = 46;
        const capsuleH = 16;
        const capsuleX = cx - capsuleW / 2;
        const capsuleY = cy + 29; // 上移技能圖示並下移膠囊，以完全消除重疊
        
        drawRoundRect(ctx, capsuleX, capsuleY, capsuleW, capsuleH, 8, '#8E9297');

        if (skillLevel <= 9) {
            // 等級 <= 9：在膠囊內顯示 RANK X 文字
            ctx.fillStyle = '#FFFFFF';
            ctx.font = "bold 10px 'Noto Sans TC'";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`RANK ${skillLevel}`, cx, capsuleY + 8);
        } else {
            // 等級 >= 10：在膠囊內顯示白色專精小圓點
            const dotR = 2.0;
            ctx.fillStyle = '#FFFFFF';
            
            if (skillLevel === 10) {
                // 1 個小圓點 (置中)
                ctx.beginPath();
                ctx.arc(cx, capsuleY + 8, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();
            } else if (skillLevel === 11) {
                // 2 個小圓點 (左右並排)
                ctx.beginPath();
                ctx.arc(cx - 4, capsuleY + 8, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();
                
                ctx.beginPath();
                ctx.arc(cx + 4, capsuleY + 8, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();
            } else if (skillLevel >= 12) {
                // 3 個小圓點 (三角形排列)
                // 頂部圓點
                ctx.beginPath();
                ctx.arc(cx, capsuleY + 5.5, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();
                
                // 左下圓點
                ctx.beginPath();
                ctx.arc(cx - 3.5, capsuleY + 11, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();
                
                // 右下圓點
                ctx.beginPath();
                ctx.arc(cx + 3.5, capsuleY + 11, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();
            }
        }

        // 4. 繪製技能名稱 (Y 座標依舊保持在 capsuleY + 20)
        ctx.fillStyle = '#1A1A1A';
        ctx.font = "bold 16px 'Noto Sans TC'";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(toTraditional(s.name), cx, capsuleY + 20);
    }

    ctx.textAlign = 'left';

    // ==========================================
    // B. 右側區域 (配置總覽與背景圓環)
    // ==========================================
    const rightZoneX = 784;
    const rightZoneY = 96;

    // 繪製背景大圓環 (Right Zone Construction Rings, 位於面板底層)
    ctx.save();
    ctx.beginPath();
    ctx.arc(rightZoneX + 486 + 260, rightZoneY + 80 + 260, 260, 0, Math.PI * 2);
    ctx.strokeStyle = '#D9DEE3';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.52;
    ctx.stroke();
    ctx.restore();

    // 黑色豎線
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(rightZoneX, rightZoneY, 10, 58);

    // 配置總覽
    ctx.fillStyle = '#1A1A1A';
    ctx.font = "900 50px 'Noto Sans TC'";
    ctx.textBaseline = 'top';
    ctx.fillText("配置總覽", rightZoneX + 28, rightZoneY + 4);

    // 右上角條碼
    const barcodeX = rightZoneX + 852;
    const barcodeY = rightZoneY + 4;
    ctx.fillStyle = '#D9DEE3';
    ctx.fillRect(barcodeX, barcodeY, 146, 36);
    
    ctx.fillStyle = '#BFC5CB';
    ctx.globalAlpha = 0.7;
    ctx.fillRect(barcodeX + 10, barcodeY, 8, 36);
    ctx.fillRect(barcodeX + 26, barcodeY, 4, 36);
    ctx.fillRect(barcodeX + 42, barcodeY, 4, 36);
    ctx.fillRect(barcodeX + 58, barcodeY, 8, 36);
    ctx.fillRect(barcodeX + 74, barcodeY, 4, 36);
    ctx.fillRect(barcodeX + 90, barcodeY, 4, 36);
    ctx.fillRect(barcodeX + 106, barcodeY, 8, 36);
    ctx.fillRect(barcodeX + 122, barcodeY, 4, 36);
    ctx.globalAlpha = 1.0;

    // ==========================================
    // C. 右側天賦陣列 (x: 784, y: 216, w: 1040, h: 動態高度)
    // ==========================================
    // 用 groupTalents 對三種天賦分別進行分組
    const abilityGroups = groupTalents(data.charData.abilityTalents);
    const combatGroups = groupTalents(data.charData.combatTalents);
    const cultivationGroups = groupTalents(data.charData.cultivationTalents);
    const hasCultivation = cultivationGroups.length > 0;

    const talentX = rightZoneX;
    const talentY = rightZoneY + 120;
    const talentW = 1040;
    const talentH = hasCultivation ? 402 : 298;

    enableShadow(ctx);
    drawRoundRect(ctx, talentX, talentY, talentW, talentH, 16, '#FFFFFF', '#EEF0F2', 2);
    disableShadow(ctx);

    // 頂部黃色橫線
    ctx.fillStyle = '#FFCE1F';
    ctx.fillRect(talentX, talentY, 1040, 6);

    // "天賦陣列"
    ctx.fillStyle = '#1A1A1A';
    ctx.font = "900 34px 'Noto Sans TC'";
    ctx.fillText("天賦陣列", talentX + 26, talentY + 24);


    // 繪製天賦 Row
    const talentRowOffsets = [82, 134, 186, 238, 290];

    // 建立天賦的動態行結構
    const talentRows = [];

    // 第一行：能力天賦 (Ability Talents)
    if (abilityGroups.length > 0) {
        talentRows.push({
            name: abilityGroups[0].name,
            icon: 'abilityTalents.png',
            nodes: abilityGroups[0].nodes,
            type: 'ability'
        });
    } else {
        talentRows.push({
            name: '明晰',
            icon: 'abilityTalents.png',
            nodes: [],
            type: 'ability'
        });
    }

    // 第二、三行：戰鬥天賦 (Combat Talents)，最多兩行
    for (let k = 0; k < 2; k++) {
        if (combatGroups[k]) {
            talentRows.push({
                name: combatGroups[k].name,
                icon: 'combatTalents.png',
                nodes: combatGroups[k].nodes,
                type: 'combat'
            });
        } else {
            talentRows.push({
                name: k === 0 ? '灼心' : '復燃',
                icon: 'combatTalents.png',
                nodes: [],
                type: 'combat'
            });
        }
    }

    // 第四、五行：培育天賦 (Cultivation Talents)，僅在有此類天賦時繪製，最多兩行
    if (hasCultivation) {
        for (let k = 0; k < 2; k++) {
            if (cultivationGroups[k]) {
                talentRows.push({
                    name: cultivationGroups[k].name,
                    icon: 'cultivationTalents.png',
                    nodes: cultivationGroups[k].nodes,
                    type: 'cultivation'
                });
            } else {
                talentRows.push({
                    name: k === 0 ? '記憶熔爐' : '不熄炎火',
                    icon: 'cultivationTalents.png',
                    nodes: [],
                    type: 'cultivation'
                });
            }
        }
    }

    const rowX = talentX + 24;
    const rowW = 992;
    const rowH = 42;

    for (let i = 0; i < talentRows.length; i++) {
        const ry = talentY + talentRowOffsets[i];
        const isOdd = (i % 2 === 0);
        const rowBg = isOdd ? '#F7F8FA' : '#FFFFFF';
        const rowData = talentRows[i];

        // 畫行背景與邊線
        drawRoundRect(ctx, rowX, ry, rowW, rowH, 4, rowBg, '#EEF0F2', 1);

        // 1. 畫左側 Icon (放大尺寸至 32x32 並調整置中)
        const iconX = rowX + 16;
        const iconY = ry + 5;
        const iconImg = getImage(`images/talent/${rowData.icon}`);
        if (iconImg) {
            ctx.drawImage(iconImg, iconX, iconY, 32, 32);
        }

        // 2. 畫天賦名稱 (移除 Meta 小字，並使用 middle 實現完美上下置中)
        ctx.fillStyle = '#666666';
        ctx.font = "bold 24px 'Noto Sans TC'";
        ctx.textBaseline = 'middle';
        ctx.fillText(toTraditional(rowData.name), rowX + 62, ry + 21);
        ctx.textBaseline = 'top';

        const nodeXs = [282, 434, 586, 738];

        // 4. 畫 Connector 連接線 (只繪製到最大節點數 - 1，且排除第一行 abilityTalents)
        const maxCount = rowData.nodes.length;
        if (rowData.type !== 'ability') {
            ctx.fillStyle = '#D9DEE3';
            for (let j = 0; j < maxCount - 1; j++) {
                ctx.fillRect(rowX + 330 + j * 152, ry + 20, 82, 1.5);
            }
        }

        // 5. 畫圓形節點 (限制最大繪製節點數)
        const activeCount = maxCount; // 預設全部激活

        for (let j = 0; j < maxCount; j++) {
            const nx = rowX + nodeXs[j];
            const ny = ry + 3;
            const isNodeActive = j < activeCount;
            const nodeTalent = rowData.nodes[j];

            if (rowData.type === 'cultivation') {
                // 培育天賦 (cultivationTalents)：使用圓角方形節點與原色圖片
                if (isNodeActive) {
                    // 繪製灰色圓角外框
                    drawRoundRect(ctx, nx, ny, 36, 36, 6, '#8E9297');

                    // 繪製黃底黑字的天賦原始圖片 (不染色)
                    let nodeDrawn = false;
                    if (nodeTalent && nodeTalent.iconUrl) {
                        const nodePath = await resolveImagePath(nodeTalent.iconUrl);
                        const nodeIconImg = getImage(nodePath);
                        if (nodeIconImg) {
                            ctx.drawImage(nodeIconImg, nx + 3, ny + 3, 30, 30);
                            nodeDrawn = true;
                        }
                    }
                    if (!nodeDrawn) {
                        drawRoundRect(ctx, nx + 3, ny + 3, 30, 30, 4, '#FFCE1F');
                    }

                    // 根據天賦後綴名稱繪製對應的右下角等級圖標 (alpha.png, beta.png, gemma.png)
                    if (nodeTalent) {
                        const tName = nodeTalent.name;
                        let suffixImg = null;
                        if (tName.includes('α') || tName.includes('alpha') || tName.includes('α')) {
                            suffixImg = getImage('images/talent/alpha.png');
                        } else if (tName.includes('β') || tName.includes('beta') || tName.includes('β')) {
                            suffixImg = getImage('images/talent/beta.png');
                        } else if (tName.includes('γ') || tName.includes('gemma') || tName.includes('gamma') || tName.includes('γ')) {
                            suffixImg = getImage('images/talent/gemma.png');
                        }

                        if (suffixImg) {
                            // 繪製等級圖標在圓角方形節點右下角，寬 18, 高 24，微重疊 3px，底端略低於節點底部 2px
                            ctx.drawImage(suffixImg, nx + 33, ny + 14, 18, 24);
                        }
                    }
                } else {
                    // 未激活的培育天賦節點
                    drawRoundRect(ctx, nx, ny, 36, 36, 6, '#FFFFFF', '#D9DEE3', 2);
                }
            } else {
                // 普通天賦：使用黃色圓形節點與白色染色圖片
                if (isNodeActive) {
                    ctx.beginPath();
                    ctx.arc(nx + 18, ny + 18, 18, 0, Math.PI * 2);
                    ctx.fillStyle = '#FFCE1F';
                    ctx.fill();
                    ctx.strokeStyle = '#AEB4BA';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                    ctx.closePath();

                    let nodeDrawn = false;
                    if (nodeTalent && nodeTalent.iconUrl) {
                        const nodePath = await resolveImagePath(nodeTalent.iconUrl);
                        const nodeIconImg = getImage(nodePath);
                        if (nodeIconImg) {
                            const tinted = tintImage(nodeIconImg, '#FFFFFF');
                            ctx.drawImage(tinted, nx + 4, ny + 4, 28, 28); // 放大圖示尺寸至 28x28
                            nodeDrawn = true;
                        }
                    }
                    if (!nodeDrawn) {
                        drawSparkles(ctx, nx + 4, ny + 4, 28, '#FFFFFF');
                    }
                } else {
                    ctx.beginPath();
                    ctx.arc(nx + 18, ny + 18, 18, 0, Math.PI * 2);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fill();
                    ctx.strokeStyle = '#D9DEE3';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.closePath();
                }

                // 戰鬥天賦 (rowData.type === 'combat') 繪製右下角的等級膠囊圖片
                if (rowData.type === 'combat') {
                    const badgeCount = j + 1;
                    const badgeFilename = isNodeActive ? `${badgeCount}.png` : `${badgeCount}_empty.png`;
                    const badgeImg = getImage(`images/talent/${badgeFilename}`);
                    if (badgeImg) {
                        const bbox = TALENT_BADGE_BBOX[badgeFilename];
                        if (bbox) {
                            const realH = bbox[3] - bbox[1];
                            const targetH = 13;
                            const scale = targetH / realH;
                            const drawW = badgeImg.width * scale;
                            const drawH = badgeImg.height * scale;
                            
                            // 幾何左上角對齊點定在圓圈右下緣的固定位置 (nx + 28, ny + 27)
                            const targetX = nx + 28;
                            const targetY = ny + 27;
                            
                            const drawX = targetX - bbox[0] * scale;
                            const drawY = targetY - bbox[1] * scale;
                            
                            ctx.drawImage(badgeImg, drawX, drawY, drawW, drawH);
                        }
                    }
                }
            }
        }
    }

    // ==========================================
    // D. 右側武器面板 (AStV1, x: 784, y: 678, w: 512, h: 472)
    // ==========================================
    const wpnX = rightZoneX;
    const wpnY = rightZoneY + 582;
    const wpnW = 512;
    const wpnH = 472;

    enableShadow(ctx);
    drawRoundRect(ctx, wpnX, wpnY, wpnW, wpnH, 16, '#FFFFFF', '#EEF0F2', 2);
    disableShadow(ctx);

    // 潛能底板 (先繪製底板與圖示，作為背景圖層)
    const potPlateX = wpnX + 29;
    const potPlateY = wpnY + 82;
    drawRoundRect(ctx, potPlateX, potPlateY, 204, 26, 4, '#EEF0F2');

    // 潛能圖示
    // 動態載入潛能圖示
    const potIcon = getImage(`images/character/potential_${data.potentialLevel || 0}.png`);
    if (potIcon) {
        ctx.drawImage(potIcon, wpnX + 182, wpnY + 45, 51, 51);
    }

    // 動態等級 (後繪製文字與星星，作為前景圖層，避免被底板遮擋)
    ctx.fillStyle = '#1A1A1A';
    ctx.font = "900 64px 'Noto Sans TC'";
    ctx.fillText(String(data.weapon?.level || 0), wpnX + 28, wpnY + 28);

    // "LEVEL" (X 座標往右微調至 wpnX + 115 以防與等級重疊)
    ctx.fillStyle = '#666666';
    ctx.font = "bold 24px 'Noto Sans TC'";
    ctx.fillText("LEVEL", wpnX + 115, wpnY + 63);

    // 動態計算武器星級 (使用 8 方向描邊法勾勒灰白色星星)
    const wpnRarity = parseInt(data.weapon?.weaponData?.rarity?.value) || 5;
    if (starImg) {
        const starXs = [32, 67, 102, 137, 172, 207];
        const displayStarXs = starXs.slice(0, wpnRarity);
        for (const sx of displayStarXs) {
            drawImageWithOutline(ctx, starImg, wpnX + sx, wpnY + 115, 26, 26, '#AEB4BA', 1);
        }
    }

    // 武器插圖
    const wpnIllustrationPath = await resolveImagePath(data.weapon.weaponData.iconUrl);
    const wpnIllustration = getImage(wpnIllustrationPath);
    if (wpnIllustration) {
        ctx.drawImage(wpnIllustration, wpnX + 266, wpnY + 42, 220, 220);
    }

    // 武器類型圖示位置 (無須額外畫框，圖片已自帶背景)
    const wpnIconBoxX = wpnX + 30;
    const wpnIconBoxY = wpnY + 326;
    const centerY = wpnIconBoxY + 24; // 垂直中心 Y 座標 (48/2 = 24)
    
    // 優先加載對應的武器類型圖標，fallback 使用單手劍圖標
    const wpnTypeKey = data.weapon.weaponData.type.key || 'weapon_type_sword';
    const swordIcon = getImage(`images/weapon/${wpnTypeKey}.png`, 'images/weapon/weapon_type_sword.png');
    if (swordIcon) {
        ctx.drawImage(swordIcon, wpnIconBoxX, wpnIconBoxY, 48, 48);
    }

    // 武器名稱 "熔鑄火焰" (使用 middle 與 centerY 實現完美垂直置中對齊)
    ctx.fillStyle = '#1A1A1A';
    ctx.font = "900 34px 'Noto Sans TC'";
    ctx.textBaseline = 'middle';
    ctx.fillText(toTraditional(data.weapon.weaponData.name), wpnX + 94, centerY);
    ctx.textBaseline = 'top';


    // 底部橘色粗線
    ctx.fillStyle = themeColor;
    ctx.fillRect(wpnX, wpnY + wpnH - 10, wpnW, 10);

    // 寶石槽 (Matrix Card Slot)
    const gemSlotX = wpnX + 374;
    const gemSlotY = wpnY + 280;
    drawRoundRect(ctx, gemSlotX, gemSlotY, 112, 112, 8, '#FFFFFF', '#EEF0F2', 2);

    // 外圈圓形
    ctx.beginPath();
    ctx.arc(gemSlotX + 56, gemSlotY + 56, 40, 0, Math.PI * 2);
    ctx.strokeStyle = '#EEF0F2';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.closePath();

    const gemBaseRel = `images/gem/item_gem_rarity_${data.weapon.gem.gemData.rarity || 5}.png`;
    const gemBase = getImage(gemBaseRel);
    if (gemBase) {
        ctx.drawImage(gemBase, gemSlotX + 16, gemSlotY + 16, 80, 80);
    }

    const gemCoreRel = await resolveImagePath(data.weapon.gem.gemData.icon);
    const gemCore = getImage(gemCoreRel);
    if (gemCore) {
        ctx.drawImage(gemCore, gemSlotX + 16, gemSlotY + 16, 80, 80);
    }

    const gemName = toTraditional(data.weapon.gem.gemData.name || "無瑕基質·夜幕");
    ctx.fillStyle = '#888888';
    ctx.font = "normal 12px 'Noto Sans TC'";
    ctx.textAlign = 'center';
    ctx.fillText(gemName, gemSlotX + 56, gemSlotY + 128);
    ctx.textAlign = 'left';

    // ==========================================
    // E. 右側裝備與道具卡片區 (WRhpT, x: 1328, y: 678, w: 496, h: 472)
    // ==========================================
    const eqpX = rightZoneX + 544;
    const eqpY = rightZoneY + 582;
    const eqpW = 496;
    const eqpH = 472;

    enableShadow(ctx);
    drawRoundRect(ctx, eqpX, eqpY, eqpW, eqpH, 16, '#FFFFFF', '#EEF0F2', 2);
    disableShadow(ctx);

    // Title Group
    const titleGroupX = eqpX + 16;
    const titleGroupY = eqpY + 16;
    
    ctx.fillStyle = '#1A1A1A';
    ctx.font = "900 22px 'Noto Sans TC'";
    ctx.fillText("| 裝備", titleGroupX, titleGroupY);


    // 裝備卡片數據
    const equipsData = [
        {
            name: toTraditional(data.bodyEquip.equipData.name),
            lvl: data.bodyEquip.equipData.level.value,
            img: await resolveImagePath(data.bodyEquip.equipData.iconUrl),
            suit: data.bodyEquip.equipData.suit ? toTraditional(data.bodyEquip.equipData.suit.name) : null,
            icon: "shirt",
            iconImg: "images/equipment/bodyEquip.png"
        },
        {
            name: toTraditional(data.armEquip.equipData.name),
            lvl: data.armEquip.equipData.level.value,
            img: await resolveImagePath(data.armEquip.equipData.iconUrl),
            suit: data.armEquip.equipData.suit ? toTraditional(data.armEquip.equipData.suit.name) : null,
            icon: "hand",
            iconImg: "images/equipment/armEquip.png"
        },
        {
            name: toTraditional(data.firstAccessory.equipData.name),
            lvl: data.firstAccessory.equipData.level.value,
            img: await resolveImagePath(data.firstAccessory.equipData.iconUrl),
            suit: data.firstAccessory.equipData.suit ? toTraditional(data.firstAccessory.equipData.suit.name) : null,
            icon: "eye",
            iconImg: "images/equipment/firstAccessory.png"
        },
        {
            name: toTraditional(data.secondAccessory.equipData.name),
            lvl: data.secondAccessory.equipData.level.value,
            img: await resolveImagePath(data.secondAccessory.equipData.iconUrl),
            suit: data.secondAccessory.equipData.suit ? toTraditional(data.secondAccessory.equipData.suit.name) : null,
            icon: "eye",
            iconImg: "images/equipment/secondAccessory.png"
        },
        {
            name: toTraditional(data.tacticalItem.tacticalItemData.name),
            lvl: "MAX",
            img: await resolveImagePath(data.tacticalItem.tacticalItemData.iconUrl),
            suit: null,
            icon: null,
            iconImg: "images/equipment/tacticalItem.png"
        }
    ];

    const eqAreaX = eqpX + 16;
    const eqAreaY = eqpY + 104;

    // A. 繪製左列: Card 1 (護甲) & Card 2 (護手)，寬 224, 高 146, Gap: 12
    const leftColX = eqAreaX;
    const cardH = 146;
    const cardW = 224;

    for (let i = 0; i < 2; i++) {
        const eq = equipsData[i];
        const cy = eqAreaY + i * (cardH + 12);

        // 1. 卡片底框 (修正圓角半徑為 4px)
        drawRoundRect(ctx, leftColX, cy, cardW, cardH, 4, '#FFFFFF', '#EEF0F2', 1.5);

        // 2. 等級
        ctx.fillStyle = '#1A1A1A';
        ctx.font = "900 28px 'Noto Sans TC'";
        ctx.fillText(eq.lvl, leftColX + 12, cy + 12);
        
        ctx.fillStyle = '#888888';
        ctx.font = "bold 10px 'Noto Sans TC'";
        // 微調 X 座標為 leftColX + 54 以防重疊
        ctx.fillText("LEVEL", leftColX + 54, cy + 22);

        // 3. 套裝標籤
        if (eq.suit) {
            ctx.font = "bold 10px 'Noto Sans TC'";
            const suitText = `${eq.suit} 3件套`;
            const textW = ctx.measureText(suitText).width;

            let tagBg = '#E3F2FD';
            let tagTextColor = '#1E88E5';
            if (eq.suit === '動火用') {
                tagBg = '#FFF3E0';
                tagTextColor = '#FB8C00';
            }

            drawRoundRect(ctx, leftColX + 12, cy + 50, textW + 12, 18, 4, tagBg);
            ctx.fillStyle = tagTextColor;
            ctx.textBaseline = 'middle';
            ctx.fillText(suitText, leftColX + 18, cy + 59); // 中點 Y 軸為 cy + 50 + 9
            ctx.textBaseline = 'top';
        }

        // 4. 5 顆灰白星星 (使用 8 方向描邊法勾勒灰白色星星)
        if (starImg) {
            for (let j = 0; j < 5; j++) {
                drawImageWithOutline(ctx, starImg, leftColX + 12 + j * 12, cy + 84, 10, 10, '#AEB4BA', 1);
            }
        }

        // 5. 名稱組
        const centerY = cy + 113;

        // 繪製小 icon 替代 emoji
        const smIcon = getImage(eq.iconImg);
        if (smIcon) {
            ctx.drawImage(smIcon, leftColX + 12, centerY - 8, 16, 16);
        }

        ctx.fillStyle = '#1A1A1A';
        ctx.font = "bold 14px 'Noto Sans TC'";
        ctx.textBaseline = 'middle';
        ctx.fillText(eq.name, leftColX + 34, centerY);
        ctx.textBaseline = 'top';

        // 6. 裝備大圖 (尺寸從 64x64 放大至 80x80 並垂直置中)
        const eqImg = getImage(eq.img);
        if (eqImg) {
            ctx.drawImage(eqImg, leftColX + 132, cy + 33, 80, 80);
        }

        // 7. 底部黃色橫線 (w: 224, h: 4, fill: #FFCE1F)
        ctx.fillStyle = '#FFCE1F';
        ctx.fillRect(leftColX, cy + cardH - 4, cardW, 4);
    }

    // B. 繪製右列: Card 3 (配件1) & Card 4 (配件2) & Card 5 (飲料)，寬 224, 高 94, Gap: 10
    const rightColX = eqAreaX + cardW + 16;
    const smCardH = 94;

    for (let i = 2; i < 5; i++) {
        const eq = equipsData[i];
        const cy = eqAreaY + (i - 2) * (smCardH + 10);

        // 1. 卡片底框 (修正圓角半徑為 4px)
        drawRoundRect(ctx, rightColX, cy, cardW, smCardH, 4, '#FFFFFF', '#EEF0F2', 1.5);

        if (i < 4) {
            // 配件卡片
            // 等級
            ctx.fillStyle = '#1A1A1A';
            ctx.font = "900 20px 'Noto Sans TC'";
            ctx.fillText(eq.lvl, rightColX + 12, cy + 8);
            
            ctx.fillStyle = '#888888';
            ctx.font = "bold 8px 'Noto Sans TC'";
            // 微調 X 座標為 rightColX + 44 以防重疊
            ctx.fillText("LEVEL", rightColX + 44, cy + 16);

            // 套裝標籤 (等級右側)
            if (eq.suit) {
                ctx.font = "bold 9px 'Noto Sans TC'";
                const suitText = `${eq.suit} 3件套`;
                const textW = ctx.measureText(suitText).width;
                drawRoundRect(ctx, rightColX + 78, cy + 8, textW + 10, 16, 4, '#FFF3E0');
                ctx.fillStyle = '#FB8C00';
                ctx.textBaseline = 'middle';
                ctx.fillText(suitText, rightColX + 83, cy + 16); // 中點 Y 軸為 cy + 8 + 8
                ctx.textBaseline = 'top';
            }

            // 5 顆灰白星星 (使用 8 方向描邊法勾勒灰白色星星)
            if (starImg) {
                for (let j = 0; j < 5; j++) {
                    drawImageWithOutline(ctx, starImg, rightColX + 12 + j * 10, cy + 38, 8, 8, '#AEB4BA', 1);
                }
            }

            // 名稱組
            const centerY = cy + 62.5;

            // 繪製小 icon 替代 emoji
            const smIcon = getImage(eq.iconImg);
            if (smIcon) {
                ctx.drawImage(smIcon, rightColX + 12, centerY - 7.5, 15, 15);
            }

            ctx.fillStyle = '#1A1A1A';
            ctx.font = "bold 13px 'Noto Sans TC'";
            ctx.textBaseline = 'middle';
            ctx.fillText(eq.name, rightColX + 32, centerY);
            ctx.textBaseline = 'top';

            // 裝備小圖 (尺寸從 48x48 放大至 60x60 並垂直置中)
            const eqImg = getImage(eq.img);
            if (eqImg) {
                ctx.drawImage(eqImg, rightColX + 152, cy + 17, 60, 60);
            }

            // 底部黃色橫線
            ctx.fillStyle = '#FFCE1F';
            ctx.fillRect(rightColX, cy + smCardH - 4, cardW, 4);

        } else {
            // Card 5: 飲料
            ctx.fillStyle = '#888888';
            ctx.font = "bold 10px 'Noto Sans TC'";
            ctx.fillText("戰術物品", rightColX + 12, cy + 12);

            // 繪製小 icon
            const centerY = cy + 53;
            const smIcon = getImage(eq.iconImg);
            if (smIcon) {
                ctx.drawImage(smIcon, rightColX + 12, centerY - 9, 18, 18);
            }

            ctx.fillStyle = '#1A1A1A';
            ctx.font = "bold 18px 'Noto Sans TC'";
            ctx.textBaseline = 'middle';
            ctx.fillText(eq.name, rightColX + 34, centerY);
            ctx.textBaseline = 'top';

            const eqImg = getImage(eq.img);
            if (eqImg) {
                ctx.drawImage(eqImg, rightColX + 152, cy + 17, 60, 60);
            }

            // 底部紫色橫線
            ctx.fillStyle = '#A66CFF';
            ctx.fillRect(rightColX, cy + smCardH - 4, cardW, 4);
        }
    }

    // ==========================================
    // 回傳圖片 Buffer
    // ==========================================
    return canvas.toBuffer('image/png');
}

module.exports = {
    renderCharacter
};
