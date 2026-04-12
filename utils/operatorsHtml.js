const https = require('https');
const { URL } = require('url');

const CSS_URL = 'https://gist.githubusercontent.com/xydesu/2b5a43548db736c72b161c65b6ccbdc1/raw/eac4fc55ade3ba1267ce49b90954e58b7f70f004/style.css';
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
 * @param {Array<{id: string, charData: object, level: number, evolvePhase: number, potentialLevel: number}>} chars
 * @returns {Promise<string>} HTML string
 */
async function generateOperatorsHtml(chars) {
    const css = await getOperatorsCSS();

    const numCols = Math.min(chars.length, 4);

    let overrideCSS = '\n/* Dynamic operator overrides */\n';

    // Allow the grid to grow beyond a single row
    overrideCSS += `.scraped-style-0 { height: auto !important; overflow: visible !important; }\n`;
    overrideCSS += `.scraped-style-1 { height: auto !important; grid-template-rows: auto !important; grid-template-columns: repeat(${numCols}, 84.8px) !important; }\n`;

    chars.forEach((char, idx) => {
        const { charData, evolvePhase } = char;
        if (!charData) return;

        const sel = `.op-card-${idx}`;

        // Avatar
        if (charData.avatarSqUrl) {
            overrideCSS += `${sel} .scraped-style-6 { background-image: url("${escapeCssUrl(charData.avatarSqUrl)}") !important; }\n`;
        }

        // Property (element) icon + background colour
        const propInfo = PROPERTY_MAP[charData.property?.key];
        if (propInfo) {
            const elementUrl = `${ASSETS_BASE}/elements/${propInfo.element}-active.png`;
            overrideCSS += `${sel} .scraped-style-10 { background-color: ${propInfo.bgColor} !important; }\n`;
            overrideCSS += `${sel} .scraped-style-11 { background-image: url("${escapeCssUrl(elementUrl)}") !important; }\n`;
        }

        // Profession icon
        const profKey = PROFESSION_MAP[charData.profession?.key];
        if (profKey) {
            const profIconUrl = `${ASSETS_BASE}/professions/${profKey}.png`;
            overrideCSS += `${sel} .scraped-style-9 { background-image: url("${escapeCssUrl(profIconUrl)}") !important; }\n`;
        }

        // Evolve phase icon
        if (evolvePhase !== null && evolvePhase !== undefined) {
            const evolveUrl = `${ASSETS_BASE}/evolve-phases/phase-${evolvePhase}.png`;
            overrideCSS += `${sel} .scraped-style-17 { background-image: url("${escapeCssUrl(evolveUrl)}") !important; }\n`;
        }
    });

    const cards = chars.map((char, idx) => {
        const { charData, level } = char;
        const name = charData?.name ?? '—';

        return `
            <div class="OperatorCard__ScaleContainer-QlPmq geVdDu scraped-style-2 op-card-${idx}">
                <div class="OperatorCard__Wrapper-VeqHO ecWcHG scraped-style-3">
                    <div class="OperatorCard__WrapInner-jQqQsD crcAhl scraped-style-4">
                        <div class="OperatorCard__AvatarWrap-CaNUI iHYZtW scraped-style-5">
                            <div class="OperatorCard__Avatar-gSVgbk kqvihx scraped-style-6"></div>
                            <div class="OperatorCard__PropertyWrap-grXkRa jRVPIc scraped-style-7">
                                <div class="sc-hApDpY eSTnmd OperatorCard__Profession-gxHNRD iRCNGQ scraped-style-8">
                                    <div class="sc-esUyCF hWCrNh scraped-style-9"></div>
                                </div>
                                <div class="sc-cfLHZC bHuRra OperatorCard__Property-dJzhsq bxVqnM scraped-style-10">
                                    <div class="sc-knMmLf kVWGWq scraped-style-11"></div>
                                </div>
                            </div>
                            <div class="OperatorCard__UserStatus-csBdnw bODGjO scraped-style-12">
                                <div class="sc-ezERCi fpeSgz OperatorCard__Potential-AcSBJ ihwnus scraped-style-13"></div>
                                <div class="OperatorCard__LevelStatus-kokgQf iVJIQv scraped-style-14">
                                    <div class="OperatorCard__LevelText-ezEXiu eceHDy scraped-style-15">Lv.<span class="count scraped-style-16">${level ?? '?'}</span></div>
                                    <div class="sc-biCyHy kBumbK OperatorCard__EvolvePhase-hBKtN eVxebN scraped-style-17"></div>
                                </div>
                            </div>
                        </div>
                        <div class="OperatorCard__Bottom-gYxBRu bCOzFP scraped-style-18">
                            <div class="OperatorCard__Name-eTwRoa jWgMNa scraped-style-19">${name}</div>
                            <div class="OperatorCard__FakeName-lfmwJL bHLscd scraped-style-20">${name}</div>
                            <div class="OperatorCard__BottomDecorator-gZXihR jfPkvD scraped-style-21"></div>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');

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
<div class="operator-list__Scroll-evdVpD gUOWQu scraped-style-0">
    <div class="operator-list__OperatorGrid-eCpEkK eddQOz scraped-style-1">
        ${cards}
    </div>
</div>
</body>
</html>`;
}

module.exports = { generateOperatorsHtml };
