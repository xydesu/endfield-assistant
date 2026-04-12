const https = require('https');
const { URL } = require('url');

const CSS_URL = 'https://gist.githubusercontent.com/xydesu/9debe8afd826539f268b24f4842b6b4d/raw/e86f7fbd7b18e253319f829eb7f78dafdd3924ec/style.css';
const ASSETS_BASE = 'https://assets.skport.com/ui-component/endfield/assets';

// Maps char property key → { element filename suffix, background-color }
const PROPERTY_MAP = {
    char_property_cryst:       { element: 'ice',         bgColor: 'rgb(33, 198, 208)'  },
    char_property_fire:        { element: 'fire',        bgColor: 'rgb(230, 80,  50)'  },
    char_property_natural:     { element: 'natural',     bgColor: 'rgb(80,  185, 90)'  },
    char_property_water:       { element: 'water',       bgColor: 'rgb(50,  130, 220)' },
    char_property_corruption:  { element: 'corruption',  bgColor: 'rgb(130, 50,  180)' },
    char_property_electrical:  { element: 'electrical',  bgColor: 'rgb(230, 190, 50)'  },
    char_property_physical:    { element: 'physical',    bgColor: 'rgb(150, 130, 120)' },
};

// Maps profession key → filename suffix used in the assets URL
const PROFESSION_MAP = {
    profession_guard:      'guard',
    profession_sniper:     'sniper',
    profession_caster:     'caster',
    profession_medic:      'medic',
    profession_supporter:  'supporter',
    profession_defender:   'defender',
    profession_vanguard:   'vanguard',
    profession_specialist: 'specialist',
};

let cssCache = null;

function fetchText(url) {
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
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.end();
    });
}

async function getOperatorsCSS() {
    if (!cssCache) {
        cssCache = await fetchText(CSS_URL);
    }
    return cssCache;
}

function escapeCssUrl(url) {
    // Percent-encode characters that are special inside a CSS url("…") value
    return url.replace(/[^A-Za-z0-9\-_.~:/?#[\]@!$&'()*+,;=%]/g, encodeURIComponent);
}

/**
 * Generates the HTML page for the operator showcase grid.
 *
 * Uses the new deduplicated css-N class structure: structural layout classes
 * (css-0 through ~css-21) come from the fetched CSS, while per-unique-value
 * classes for avatars, profession icons, element containers/icons, and evolve
 * phase icons are generated dynamically starting at css-100, sharing a class
 * whenever two cards have the same value.
 *
 * @param {Array<{id: string, charData: object, level: number, evolvePhase: number, potentialLevel: number}>} chars
 * @returns {Promise<string>} HTML string
 */
async function generateOperatorsHtml(chars) {
    const css = await getOperatorsCSS();

    const numCols = Math.min(chars.length, 4);
    const numRows = Math.ceil(chars.length / 4);

    // Deduplication registry: semantic key → generated css class number (≥100)
    let nextNum = 100;
    const registry = new Map();
    function clsNum(key) {
        if (!registry.has(key)) registry.set(key, nextNum++);
        return registry.get(key);
    }

    // Pre-populate registry by iterating all chars so CSS is emitted before HTML
    chars.forEach(({ charData, evolvePhase }) => {
        if (!charData) return;
        if (charData.avatarSqUrl)           clsNum(`avatar:${charData.avatarSqUrl}`);
        const profKey = PROFESSION_MAP[charData.profession?.key];
        if (profKey)                         clsNum(`prof:${profKey}`);
        const propInfo = PROPERTY_MAP[charData.property?.key];
        if (propInfo) {
            clsNum(`elem-cont:${charData.property.key}`);
            clsNum(`elem-icon:${charData.property.key}`);
        }
        if (evolvePhase != null)             clsNum(`evolve:${evolvePhase}`);
    });

    // Grid overrides
    let dynamicCSS = '\n/* Grid overrides */\n';
    dynamicCSS += `.css-0 { height: auto !important; overflow: visible !important; }\n`;
    dynamicCSS += `.css-1 { height: auto !important; grid-template-rows: repeat(${numRows}, 140.65px) !important; grid-template-columns: repeat(${numCols}, 84.8px) !important; }\n`;

    // Dynamic per-unique-value classes
    dynamicCSS += '\n/* Dynamic card properties */\n';
    for (const [key, n] of registry) {
        if (key.startsWith('avatar:')) {
            const url = key.slice('avatar:'.length);
            dynamicCSS += `.css-${n} { background-image: url("${escapeCssUrl(url)}"); background-position: 50%; background-repeat: no-repeat; background-size: cover; height: 124.883px; width: 89.35px; }\n`;
        } else if (key.startsWith('prof:')) {
            const profKey = key.slice('prof:'.length);
            const iconUrl = `${ASSETS_BASE}/professions/${profKey}.png`;
            dynamicCSS += `.css-${n} { background-image: url("${escapeCssUrl(iconUrl)}"); background-position: 50%; background-repeat: no-repeat; background-size: contain; height: 14.8333px; transition-duration: 0.16s; transition-property: background-image; transition-timing-function: ease-in-out; width: 14.8333px; }\n`;
        } else if (key.startsWith('elem-cont:')) {
            const propKey = key.slice('elem-cont:'.length);
            const propInfo = PROPERTY_MAP[propKey];
            if (propInfo) {
                dynamicCSS += `.css-${n} { align-items: center; background-color: ${propInfo.bgColor}; border-radius: 1px; display: flex; height: 16.2333px; justify-content: center; transition-duration: 0.16s; transition-property: background-color; transition-timing-function: ease-in-out; width: 16.2333px; }\n`;
            }
        } else if (key.startsWith('elem-icon:')) {
            const propKey = key.slice('elem-icon:'.length);
            const propInfo = PROPERTY_MAP[propKey];
            if (propInfo) {
                const iconUrl = `${ASSETS_BASE}/elements/${propInfo.element}-active.png`;
                dynamicCSS += `.css-${n} { background-image: url("${escapeCssUrl(iconUrl)}"); background-position: 50%; background-repeat: no-repeat; background-size: contain; height: 16.2333px; width: 16.2333px; }\n`;
            }
        } else if (key.startsWith('evolve:')) {
            const phase = key.slice('evolve:'.length);
            const evolveUrl = `${ASSETS_BASE}/evolve-phases/phase-${phase}.png`;
            dynamicCSS += `.css-${n} { background-image: url("${escapeCssUrl(evolveUrl)}"); background-position: 50%; background-repeat: no-repeat; background-size: contain; filter: drop-shadow(rgba(0,0,0,0.4) 0px 0px 1px); height: 14.2px; width: 14.2px; }\n`;
        }
    }

    // Generate card HTML using the new deduplicated css-N structure
    const cards = chars.map(({ charData, level, evolvePhase }) => {
        const name = charData?.name ?? '—';

        const avatarCls  = charData?.avatarSqUrl                        ? `css-${clsNum(`avatar:${charData.avatarSqUrl}`)}` : '';
        const profCls    = PROFESSION_MAP[charData?.profession?.key]     ? `css-${clsNum(`prof:${PROFESSION_MAP[charData.profession.key]}`)}` : '';
        const propInfo   = PROPERTY_MAP[charData?.property?.key];
        const elemContCls = propInfo ? `css-${clsNum(`elem-cont:${charData.property.key}`)}` : '';
        const elemIconCls = propInfo ? `css-${clsNum(`elem-icon:${charData.property.key}`)}` : '';
        const evolveCls  = (evolvePhase != null) ? `css-${clsNum(`evolve:${evolvePhase}`)}` : '';

        return `<div class="css-2"><div class="css-3"><div class="css-4"><div class="css-5"><div class="${avatarCls}"></div><div class="css-7"><div class="css-8"><div class="${profCls}"></div></div><div class="${elemContCls}"><div class="${elemIconCls}"></div></div></div><div class="css-12"><div class="css-13"></div><div class="css-14"><div class="css-15">Lv.<span class="css-16">${level ?? '?'}</span></div><div class="${evolveCls}"></div></div></div></div><div class="css-18"><div class="css-19">${name}</div><div class="css-20">${name}</div><div class="css-21"></div></div></div></div></div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 0; background: transparent; }
${css}
${dynamicCSS}
</style>
</head>
<body>
<div class="css-0">
    <div class="css-1">${cards}</div>
</div>
</body>
</html>`;
}

module.exports = { generateOperatorsHtml };
