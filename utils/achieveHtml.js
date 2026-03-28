const https = require('https');
const { URL } = require('url');

const CSS_URL = 'https://gist.githubusercontent.com/xydesu/afe894a747f76f66eb4a1379ae711800/raw/3dc55df02c3ee9682c9c8b53a52ba8f510b83655/style.css';
const CERTIFY_BADGE_URL = 'https://static.skport.com/skport-fe-static/skport-game-tools/images/certifyBg.135716.png';
const CERTIFY_BADGE_CSS = `content: ""; position: absolute; width: 1.54028vw; height: 1.54028vw; background-image: url("${CERTIFY_BADGE_URL}"); background-size: contain; background-position: center center; background-repeat: no-repeat; top: 0.23696vw; left: 50%; transform: translateX(-50%);`;

// Ordered slot class names from the styled-components template (top row 1-5, bottom row 6-10)
const SLOT_CLASSES = ['klgUbY', 'cwMmAm', 'fQkaca', 'llIOHZ', 'kktMxW', 'iXzQoF', 'iNfqxe', 'dLsQli', 'fvknSk', 'fuKGpv'];

// Slots that already have ::after (certify badge) defined in the original CSS
const ORIGINAL_CERTIFY_SLOTS = new Set(['fQkaca', 'llIOHZ', 'kktMxW']);

let cssCache = null;

async function fetchText(url) {
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

async function getAchieveCSS() {
    if (!cssCache) {
        cssCache = await fetchText(CSS_URL);
    }
    return cssCache;
}

// Escape double quotes in a URL so it is safe to embed inside CSS url("…")
function escapeCssUrl(url) {
    return url.replace(/"/g, '%22');
}

function getMedalIconUrl(medal) {
    if (!medal) return null;
    const data = medal.achievementData;
    if (medal.isPlated && data.platedIcon) return data.platedIcon;
    if (medal.level === 3 && data.reforge3Icon) return data.reforge3Icon;
    if (medal.level === 2 && data.reforge2Icon) return data.reforge2Icon;
    return data.initIcon || null;
}

function buildDisplayMedals(achieve) {
    const display = achieve.display || {};
    const medals = achieve.achieveMedals || [];
    const result = [];
    for (let i = 1; i <= 10; i++) {
        const medalId = display[String(i)];
        if (!medalId) { result.push(null); continue; }
        const medal = medals.find((m) => m.achievementData.id === medalId);
        result.push(medal || null);
    }
    return result;
}

async function generateAchieveHtml(achieve) {
    const css = await getAchieveCSS();

    const medals = achieve.achieveMedals || [];
    const bronzeCount = medals.filter((m) => m.level === 1).length;
    const silverCount = medals.filter((m) => m.level === 2).length;
    const goldCount = medals.filter((m) => m.level === 3).length;
    const totalCount = achieve.count ?? (bronzeCount + silverCount + goldCount);

    const displayMedals = buildDisplayMedals(achieve);

    // Generate override CSS for each slot
    let overrideCSS = '\n/* Dynamic medal overrides */\n';
    SLOT_CLASSES.forEach((cls, idx) => {
        const medal = displayMedals[idx];
        const iconUrl = getMedalIconUrl(medal);

        // Override ::before image
        overrideCSS += `.${cls}::before { background-image: ${iconUrl ? `url("${escapeCssUrl(iconUrl)}")` : 'none'} !important; }\n`;

        // Handle ::after (certify badge)
        const hasCertify = medal?.achievementData?.canCertify === true;
        if (ORIGINAL_CERTIFY_SLOTS.has(cls)) {
            if (!hasCertify) {
                overrideCSS += `.${cls}::after { content: none !important; }\n`;
            }
        } else if (hasCertify) {
            overrideCSS += `.${cls}::after { ${CERTIFY_BADGE_CSS} }\n`;
        }
    });

    const topRow = SLOT_CLASSES.slice(0, 5)
        .map((cls) => `<div class="sc-efhFTv ${cls}"></div>`)
        .join('');
    const bottomRow = SLOT_CLASSES.slice(5, 10)
        .map((cls) => `<div class="sc-efhFTv ${cls}"></div>`)
        .join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin: 0; padding: 0; background: transparent; }
${css}
${overrideCSS}
</style>
</head>
<body>
<div class="sc-cVbFvA bESBDX">
    <div class="sc-dDEBgH CQnpG">
        <div class="sc-bNfpWB bvNmjt">${totalCount}</div>
        <div class="sc-dtXXuQ kzYAcF">總收集數</div>
        <div class="sc-drBwtj bYvpNg"></div>
        <div class="sc-eYudRy iIFAFq">
            <div class="sc-kzOYSC jQKmyQ">
                <div class="sc-dGlnUf jvwawu"></div>
                <div class="sc-fOmPLA lcwdse">${bronzeCount}</div>
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
    <div class="sc-kkeOlZ gECvjk">
        <div class="sc-kYLqRS iGzefe">${topRow}</div>
        <div class="sc-kYLqRS bgFXsx">${bottomRow}</div>
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
        return medal?.achievementData?.canCertify === true;
    });
}

module.exports = { generateAchieveHtml, hasDisplayedCertify };
