const https = require('https');
const { URL } = require('url');

// ── Source URLs ────────────────────────────────────────────────────────────────
const PROFESSION_ENUM_URL =
    'https://gist.githubusercontent.com/xydesu/c9ff59dd9cbab4865427664ae8e89705/raw/866804baf7d3965c06cf68296b3435c3c350d041/enum_profession.js';

// ── Element icons — CDN URLs (from other_enum.js) ──────────────────────────────
const ELEMENT_ICONS = {
    char_property_physical: 'https://assets.skport.com/ui-component/endfield/assets/elements/physical.png',
    char_property_fire:     'https://assets.skport.com/ui-component/endfield/assets/elements/fire.png',
    char_property_pulse:    'https://assets.skport.com/ui-component/endfield/assets/elements/electric.png',
    char_property_cryst:    'https://assets.skport.com/ui-component/endfield/assets/elements/ice.png',
    char_property_natural:  'https://assets.skport.com/ui-component/endfield/assets/elements/nature.png',
};

// ── Element badge background colors (from color_enum.js Pt) ───────────────────
const ELEMENT_COLORS = {
    char_property_physical: '#888888',
    char_property_fire:     '#FF623D',
    char_property_pulse:    '#FFC000',
    char_property_cryst:    '#21C6D0',
    char_property_natural:  '#9EDA23',
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

// Ordered list of keys matching the data-URI order in enum_profession.js.
// The file defines: all, allActive, then each profession + its Active variant.
const PROFESSION_KEY_ORDER = [
    'all',               'allActive',
    'profession_guard',        'profession_guardActive',
    'profession_defender',     'profession_defenderActive',
    'profession_supporter',    'profession_supporterActive',
    'profession_caster',       'profession_casterActive',
    'profession_assault',      'profession_assaultActive',
    'profession_vanguard',     'profession_vanguardActive',
];

let professionIconCache = null;

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request(
            { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            }
        );
        req.on('error', reject);
        req.end();
    });
}

/**
 * Fetches enum_profession.js from the gist, extracts all embedded data-URIs
 * in document order (which matches PROFESSION_KEY_ORDER), caches, and returns
 * an object keyed by profession string (e.g. "profession_guard" → data-URI).
 */
async function getProfessionIcons() {
    if (professionIconCache) return professionIconCache;

    const text = await fetchText(PROFESSION_ENUM_URL);
    // Each profession icon is a data:image/png;base64,… literal in the file.
    const uris = Array.from(text.matchAll(/data:image\/png;base64,[A-Za-z0-9+/]+=*/g), (m) => m[0]);

    const icons = {};
    PROFESSION_KEY_ORDER.forEach((key, i) => {
        if (uris[i]) icons[key] = uris[i];
    });

    professionIconCache = icons;
    return icons;
}

module.exports = { ELEMENT_ICONS, ELEMENT_COLORS, RARITY_COLORS, getProfessionIcons };
