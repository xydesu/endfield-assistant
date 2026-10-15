const fs = require('fs');
const path = require('path');

// 輔助函數：讀取本地圖片並轉換為 Base64 Data URI
function getBase64DataUri(filePath) {
    if (!fs.existsSync(filePath)) return '';
    try {
        const buf = fs.readFileSync(filePath);
        return `data:image/png;base64,${buf.toString('base64')}`;
    } catch (err) {
        return '';
    }
}

const CHAR_DIR = path.resolve(__dirname, '../assets/images/character');
const UI_DIR = path.resolve(__dirname, '../assets/images/ui');

// ── Element icons — 本地 Base64 Data URI (徹底解耦遠端 CDN 請求) ───────────
const ELEMENT_REMOTE_FALLBACK = {
    char_property_physical: 'https://assets.skport.com/ui-component/endfield/assets/elements/physical.png',
    char_property_fire:     'https://assets.skport.com/ui-component/endfield/assets/elements/fire.png',
    char_property_pulse:    'https://assets.skport.com/ui-component/endfield/assets/elements/electric.png',
    char_property_cryst:    'https://assets.skport.com/ui-component/endfield/assets/elements/ice.png',
    char_property_natural:  'https://assets.skport.com/ui-component/endfield/assets/elements/nature.png',
};

const ELEMENT_ICONS = {};
for (const [key, fallbackUrl] of Object.entries(ELEMENT_REMOTE_FALLBACK)) {
    const localPath = path.join(CHAR_DIR, `${key}.png`);
    const dataUri = getBase64DataUri(localPath);
    const finalIcon = dataUri || fallbackUrl;
    ELEMENT_ICONS[key] = finalIcon;
    // 支援無前綴鍵值 (例如 physical, fire 等)
    const shortKey = key.replace('char_property_', '');
    ELEMENT_ICONS[shortKey] = finalIcon;
}

// ── Element badge background colors (from color_enum.js Pt) ───────────────────
const ELEMENT_COLORS = {
    char_property_physical: '#888888',
    char_property_fire:     '#FF623D',
    char_property_pulse:    '#FFC000',
    char_property_cryst:    '#21C6D0',
    char_property_natural:  '#9EDA23',
    // 支援無前綴鍵值
    physical: '#888888',
    fire:     '#FF623D',
    pulse:    '#FFC000',
    cryst:    '#21C6D0',
    natural:  '#9EDA23',
};

// ── Rarity bottom-border colors (from color_enum.js dark_rank_*) ──────────────
const RARITY_COLORS = {
    '6': 'rgba(255,113,0,1)',    // dark_rank_orange
    '5': 'rgba(255,204,0,1)',    // dark_rank_yellow
    '4': 'rgba(179,128,255,1)',  // dark_rank_purple
    '3': 'rgba(51,194,255,1)',   // dark_rank_blue
    '2': 'rgba(180,217,69,1)',   // dark_rank_green
    '1': 'rgba(178,178,178,1)',  // dark_rank_gray
};

// ── Profession icon loader ─────────────────────────────────────────────────────

let professionIconCache = null;

/**
 * 載入本地 6 種職業圖標與全部圖標，轉換為 Base64 Data URI。
 * 徹底解耦對外部 GitHub Gist 的網路請求，保證離線與網路受限環境 100% 穩定可用。
 */
function loadProfessionIcons() {
    if (professionIconCache) return professionIconCache;

    const icons = {};

    // 6 種職業
    const professions = ['guard', 'defender', 'supporter', 'caster', 'assault', 'vanguard'];
    for (const prof of professions) {
        const normalPath = path.join(CHAR_DIR, `profession_${prof}.png`);
        const activePath = path.join(CHAR_DIR, `profession_${prof}_active.png`);

        const normalUri = getBase64DataUri(normalPath);
        const activeUri = getBase64DataUri(activePath);

        // 支援完整 key 與簡寫 key
        icons[`profession_${prof}`] = normalUri;
        icons[`profession_${prof}Active`] = activeUri;
        icons[`profession_${prof}_active`] = activeUri;
        icons[prof] = normalUri;
        icons[`${prof}Active`] = activeUri;
        icons[`${prof}_active`] = activeUri;
    }

    // 全部 (all)
    const allPath = path.join(UI_DIR, 'all.png');
    const allActivePath = path.join(UI_DIR, 'all_active.png');
    const allUri = getBase64DataUri(allPath);
    const allActiveUri = getBase64DataUri(allActivePath);

    icons['all'] = allUri;
    icons['allActive'] = allActiveUri;
    icons['all_active'] = allActiveUri;

    professionIconCache = icons;
    return icons;
}

/**
 * 非同步獲取職業圖標字典，相容舊有 Promise 介面
 */
async function getProfessionIcons() {
    return loadProfessionIcons();
}

module.exports = {
    ELEMENT_ICONS,
    ELEMENT_COLORS,
    RARITY_COLORS,
    getProfessionIcons,
    loadProfessionIcons,
    getBase64DataUri
};
