const { registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

let registered = false;

/**
 * 註冊本地多語言 Noto Sans 字體（模組層級僅執行一次）
 */
function ensureFontsRegistered() {
    if (registered) return;
    registered = true;

    const langs = [
        { code: 'TC', family: 'Noto Sans TC' },
        { code: 'SC', family: 'Noto Sans SC' },
        { code: 'JP', family: 'Noto Sans JP' },
    ];
    const weights = [
        { suffix: 'Regular.ttf', weight: 'normal' },
        { suffix: 'Bold.ttf', weight: 'bold' },
        { suffix: 'Black.ttf', weight: '900' },
    ];

    try {
        for (const { code, family } of langs) {
            for (const { suffix, weight } of weights) {
                const file = `NotoSans${code}-${suffix}`;
                const fontPath = path.resolve(__dirname, '..', 'assets', 'font', file);
                if (fs.existsSync(fontPath)) {
                    registerFont(fontPath, { family, weight });
                } else {
                    console.warn(`[Fonts] 找不到字體檔案: ${file}`);
                }
            }
        }
    } catch (error) {
        console.error('[Fonts] 載入字體時發生錯誤:', error.message);
    }
}

/**
 * 取得指定語系對應的 Canvas 字體家族名稱
 * @param {string} lang
 * @returns {string}
 */
function getFontFamily(lang) {
    switch (lang) {
        case 'zh_Hans': return 'Noto Sans SC';
        case 'ja': return 'Noto Sans JP';
        case 'zh_Hant':
        case 'en':
        default: return 'Noto Sans TC';
    }
}

/**
 * 於既有預設使用 Noto Sans TC 的 Canvas Context 上，套用指定語系字體攔截
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} lang
 */
function applyLangFont(ctx, lang) {
    const fontFamily = getFontFamily(lang);
    if (fontFamily === 'Noto Sans TC') return;

    const proto = Object.getPrototypeOf(ctx);
    const desc = Object.getOwnPropertyDescriptor(proto, 'font');
    if (desc && desc.set) {
        Object.defineProperty(ctx, 'font', {
            get() {
                return desc.get.call(ctx);
            },
            set(val) {
                const newVal = typeof val === 'string'
                    ? val.replace(/'Noto Sans TC'/g, `'${fontFamily}'`).replace(/"Noto Sans TC"/g, `"${fontFamily}"`)
                    : val;
                desc.set.call(ctx, newVal);
            },
            configurable: true,
            enumerable: true,
        });
    }
}

module.exports = {
    ensureFontsRegistered,
    getFontFamily,
    applyLangFont,
};
