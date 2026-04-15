const https = require('https');
const { URL } = require('url');
const { t } = require('./i18n');

const CSS_URL = 'https://gist.githubusercontent.com/xydesu/afe894a747f76f66eb4a1379ae711800/raw/3dc55df02c3ee9682c9c8b53a52ba8f510b83655/style.css';
const CERTIFY_BADGE_URL = 'https://static.skport.com/skport-fe-static/skport-game-tools/images/certifyBg.135716.png';
const CERTIFY_BADGE_CSS = `content: ""; position: absolute; width: 1.54028vw; height: 1.54028vw; background-image: url("${CERTIFY_BADGE_URL}"); background-size: contain; background-position: center center; background-repeat: no-repeat; top: 0.23696vw; left: 50%; transform: translateX(-50%);`;

// Ordered slot class names from the styled-components template (top row 1-5, bottom row 6-10)
const SLOT_CLASSES = ['klgUbY', 'cwMmAm', 'fQkaca', 'llIOHZ', 'kktMxW', 'iXzQoF', 'iNfqxe', 'dLsQli', 'fvknSk', 'fuKGpv'];

// Slots that already have ::after (certify badge) defined in the original CSS
const ORIGINAL_CERTIFY_SLOTS = new Set(['fQkaca', 'llIOHZ', 'kktMxW']);

let cssCache = null;
let certifyApngCache = null;

function fetchBuffer(url) {
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
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.end();
    });
}

async function fetchText(url) {
    return (await fetchBuffer(url)).toString('utf8');
}

async function fetchCertifyApng() {
    if (!certifyApngCache) {
        certifyApngCache = await fetchBuffer(CERTIFY_BADGE_URL);
    }
    return certifyApngCache;
}

async function getAchieveCSS() {
    if (!cssCache) {
        cssCache = await fetchText(CSS_URL);
    }
    return cssCache;
}

const SERVER_ID_TO_NAME = {
    '2': 'Asia',
    '3': 'Americas/Europe',
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Escape double quotes in a URL so it is safe to embed inside CSS url("…")
function escapeCssUrl(url) {
    return url.replace(/"/g, '%22');
}

// Effective level = initLevel + (level - 1), where initLevel is the base tier
// of the achievement (1/2/3) and level is the user's upgrade count (1 = base).
// Tier mapping: 1 = dark, 2 = silver, 3 = gold.
function getEffectiveLevel(medal) {
    const initLevel = medal.achievementData.initLevel || 1;
    return initLevel + (medal.level || 1) - 1;
}

function getMedalIconUrl(medal) {
    if (!medal) return null;
    const data = medal.achievementData;
    if (medal.isPlated && data.platedIcon) return data.platedIcon;
    const effectiveLevel = getEffectiveLevel(medal);
    if (effectiveLevel >= 3 && data.reforge3Icon) return data.reforge3Icon;
    if (effectiveLevel >= 2 && data.reforge2Icon) return data.reforge2Icon;
    return data.initIcon || null;
}

function buildDisplayMedals(achieve) {
    const display = achieve.display || {};
    const medals = achieve.achieveMedals || [];
    const result = new Array(10).fill(null);

    for (let i = 1; i <= 10; i++) {
        const medalId = display[String(i)];
        if (!medalId) continue;
        const medal = medals.find((m) => m.achievementData.id === medalId);

        // 直接按 1-10 填入，不再進行行列換算
        result[i - 1] = medal || null;
    }
    return result;
}

async function generateAchieveHtml(achieve, { hideCertify = false, uid = '', serverId = '', botName = '終末地簽到小助手', lang = 'zh_Hant' } = {}) {
    const css = await getAchieveCSS();

    const medals = achieve.achieveMedals || [];
    const darkCount = medals.filter((m) => getEffectiveLevel(m) === 1).length;
    const silverCount = medals.filter((m) => getEffectiveLevel(m) === 2).length;
    const goldCount = medals.filter((m) => getEffectiveLevel(m) >= 3).length;
    const totalCount = achieve.count ?? (darkCount + silverCount + goldCount);

    const displayMedals = buildDisplayMedals(achieve);

    let overrideCSS = '\n/* Dynamic medal overrides */\n';
    SLOT_CLASSES.forEach((cls, idx) => {
        const medal = displayMedals[idx];
        const iconUrl = getMedalIconUrl(medal);

        overrideCSS += `.${cls}::before { background-image: ${iconUrl ? `url("${escapeCssUrl(iconUrl)}")` : 'none'} !important; }\n`;

        if (hideCertify) {
            overrideCSS += `.${cls}::after { content: none !important; }\n`;
        } else {
            const hasCertify = !!medal?.achievementData?.canCertify;
            if (ORIGINAL_CERTIFY_SLOTS.has(cls)) {
                if (!hasCertify) overrideCSS += `.${cls}::after { content: none !important; }\n`;
            } else if (hasCertify) {
                overrideCSS += `.${cls}::after { ${CERTIFY_BADGE_CSS} }\n`;
            }
        }
    });

    const topRow = SLOT_CLASSES.slice(0, 5)
        .map((cls, idx) => `<div class="sc-efhFTv ${cls} medal-slot-${idx}"></div>`)
        .join('');

    const bottomRow = SLOT_CLASSES.slice(5, 10)
        .map((cls, idx) => `<div class="sc-efhFTv ${cls} medal-slot-${idx + 5}"></div>`)
        .join('');

    const safeUid = escapeHtml(uid || '');
    const safeServerName = escapeHtml(SERVER_ID_TO_NAME[serverId] || serverId || '');
    const safeBotName = escapeHtml(botName || '終末地簽到小助手');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
body {
    margin: 0;
    padding: 40px;
    background-color: #ececec;
    font-family: Arial, "Noto Sans TC", "Microsoft JhengHei", sans-serif;
}
${css}
${overrideCSS}

#capture-root {
    width: 39.09952vw;
    margin: 0 auto;
}

.achieve-wrapper {
    width: 100%;
    margin: 0 auto;
}

.achieve-main {
    padding: 1.65876vw;
    min-height: 9.47867vw;
    box-sizing: border-box;

    display: grid;
    grid-template-columns: 36% 64%;
    column-gap: 1.1vw;
    align-items: start;

    background-image: url("https://static.skport.com/skport-fe-static/skport-game-tools/images/medalCardBg.547da7.png");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    border-radius: 1.2vw;
    overflow: hidden;
}

.achieve-left,
.achieve-right {
    min-width: 0;
    transform: none !important;
}

.achieve-left > .sc-dDEBgH {
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
}

.achieve-right {
    justify-self: start !important;
    margin-left: 0 !important;
}

.achieve-right > .sc-kkeOlZ {
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    transform: scale(0.94) !important;
    transform-origin: left top !important;
}

.achieve-right .sc-kYLqRS {
    width: 100% !important;
    margin: 0 !important;
    justify-content: flex-start !important;
    transform: none !important;
}

.sc-kkeOlZ,
.sc-kYLqRS {
    margin-left: 0 !important;
    margin-right: 0 !important;
}

.achieve-footer {
    margin-top: 12px;
    padding: 0 20px;
    box-sizing: border-box;

    display: flex;
    align-items: center;
    justify-content: space-between;

    font-size: 12px;
    line-height: 1.2;
    color: #888 !important;
    font-family: Arial, "Noto Sans TC", "Microsoft JhengHei", sans-serif !important;
}

.achieve-footer-left {
    display: flex;
    align-items: center;
    gap: 15px;
}

.achieve-footer-bot {
    color: #888 !important;
    font-family: inherit;
}
</style>
</head>
<body>
<div id="capture-root">
    <div class="achieve-wrapper">
        <div class="achieve-main">
            <div class="achieve-left">
                <div class="sc-dDEBgH CQnpG">
                    <div class="sc-bNfpWB bvNmjt">${totalCount}</div>
                    <div class="sc-dtXXuQ kzYAcF">${t(lang, 'html_achieve_total')}</div>
                    <div class="sc-drBwtj bYvpNg"></div>
                    <div class="sc-eYudRy iIFAFq">
                        <div class="sc-kzOYSC jQKmyQ">
                            <div class="sc-dGlnUf jvwawu"></div>
                            <div class="sc-fOmPLA lcwdse">${darkCount}</div>
                        </div>
                        <div class="sc-kzOYSC jQKmyQ">
                            <div class="sc-dGlnUf hLiFxM"></div>
                            <div class="sc-fOmPLA lcwdse">${silverCount}</div>
                        </div>
                        <div class="sc-kzOYSC jQKmyQ">
                            <div class="sc-dGlnUf kwGPST"></div>
                            <div class="sc-fOmPLA lcwdse">${goldCount}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="achieve-right">
                <div class="sc-kkeOlZ gECvjk">
                    <div class="sc-kYLqRS iGzefe">${topRow}</div>
                    <div class="sc-kYLqRS bgFXsx">${bottomRow}</div>
                </div>
            </div>
        </div>

        <div class="achieve-footer">
            <div class="achieve-footer-left">
                ${safeUid ? `<span>UID: ${safeUid}</span>` : ''}
                ${safeServerName ? `<span>Server: ${safeServerName}</span>` : ''}
            </div>
            <span class="achieve-footer-bot">${safeBotName}</span>
        </div>
    </div>
</div>
</body>
</html>`;
}

function hasDisplayedCertify(achieve) {
    const display = achieve.display || {};
    const medals = achieve.achieveMedals || [];
    return Object.values(display).some((medalId) => {
        const medal = medals.find((m) => m.achievementData.id === medalId);
        return !!medal?.achievementData?.canCertify;
    });
}

function getCertifySlotIndices(achieve) {
    const displayMedals = buildDisplayMedals(achieve);
    return displayMedals
        .map((medal, idx) => (medal?.achievementData?.canCertify ? idx : null))
        .filter((idx) => idx !== null);
}

module.exports = { generateAchieveHtml, hasDisplayedCertify, getCertifySlotIndices, fetchCertifyApng, SLOT_CLASSES };
