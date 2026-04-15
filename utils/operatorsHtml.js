const { ELEMENT_ICONS, ELEMENT_COLORS, RARITY_COLORS, getProfessionIcons } = require('./operatorEnums');
const { t } = require('./i18n');

const COLS = 6;
const CARD_W = 96;
const IMAGE_H = 120;
const NAME_H = 26;
const WEAPON_H = 36;
const GAP = 8;
const PADDING = 16;

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

async function generateOperatorsHtml(chars, { uid = '', serverId = '', botName = '終末地簽到小助手', lang = 'zh_tw' } = {}) {
    const professionIcons = await getProfessionIcons();

    const sorted = [...chars].sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level;
        const ra = parseInt(a.charData?.rarity?.value || '0', 10);
        const rb = parseInt(b.charData?.rarity?.value || '0', 10);
        return rb - ra;
    });

    const cardsHtml = sorted.map((char) => {
        const name = escapeHtml(char.charData?.name || '?');
        const level = char.level || 0;
        const rarity = char.charData?.rarity?.value || '4';
        const avatarUrl = escapeHtml(char.charData?.avatarRtUrl || '');
        const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS['3'];
        const professionIconUrl = escapeHtml(professionIcons[char.charData?.profession?.key] || '');
        const elementKey = char.charData?.property?.key || char.charData?.skills?.[0]?.property?.key || '';
        const elementIconUrl = escapeHtml(ELEMENT_ICONS[elementKey] || '');
        const elementBgColor = ELEMENT_COLORS[elementKey] || '#888888';
        const evolvePhase = char.evolvePhase || 0;
        const potentialLevel = char.potentialLevel || 0;
        // 武器數據獲取 (修正路徑)
        const weaponObj = char.weapon || {};
        const weaponData = weaponObj.weaponData || {};
        const weaponName = escapeHtml(weaponData.name || '');
        const weaponLevel = weaponObj.level || 0;
        const weaponIconUrl = escapeHtml(weaponData.iconUrl || '');

        return `<div class="card">
  <div class="avatar" style="background-image:url('${avatarUrl}');">
    <div class="badge-col">
      ${professionIconUrl ? `<div class="badge profession-badge"><div class="badge-icon" style="background-image:url('${professionIconUrl}');"></div></div>` : ''}
      ${elementIconUrl ? `<div class="badge element-badge" style="background:${elementBgColor};"><div class="badge-icon" style="background-image:url('${elementIconUrl}');"></div></div>` : ''}
    </div>
    <div class="avatar-bottom">
      ${potentialLevel > 0 ? `<div class="info-tag potential-tag">${t(lang, 'html_potential')}${potentialLevel}</div>` : '<span></span>'}
      <div class="level-section">
        <div class="level-text">Lv.<span class="level-num">${level}</span></div>
      </div>
    </div>
  </div>

  <div class="name">
    <span class="name-text">${name}</span>
    ${evolvePhase > 0 ? `<div class="evolve-tag">${t(lang, 'html_evolve')} ${evolvePhase}</div>` : ''}
  </div>

  ${weaponName ? `
  <div class="weapon">
    <div class="weapon-info">
      <div class="weapon-name">${weaponName}</div>
      <div class="weapon-level">Lv.${weaponLevel}</div>
    </div>
    ${weaponIconUrl ? `<div class="weapon-icon" style="background-image:url('${weaponIconUrl}');"></div>` : ''}
  </div>` : ''}

  <div class="rarity-line" style="background-color: ${rarityColor};"></div>
</div>`;
    }).join('\n');

    const LINE_H = 4; // 稀有度線高度
    const FOOTER_H = 28; // 頁腳高度
    const rows = Math.ceil(sorted.length / COLS);
    const containerW = COLS * CARD_W + (COLS - 1) * GAP + PADDING * 2;
    // 高度計算加入 LINE_H 和 FOOTER_H
    const containerH = rows * (IMAGE_H + NAME_H + WEAPON_H + LINE_H) + (rows - 1) * GAP + PADDING * 2 + FOOTER_H;

    const safeUid = escapeHtml(uid || '');
    const safeServerName = escapeHtml(SERVER_ID_TO_NAME[serverId] || serverId || '');
    const safeBotName = escapeHtml(botName || '終末地簽到小助手');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: #fff;
    font-family: Arial, 'Noto Sans TC', sans-serif;
}
#wrapper {
    display: inline-block;
    padding: ${PADDING}px;
    width: ${containerW}px;
    min-height: ${containerH}px;
}
.grid {
    display: grid;
    grid-template-columns: repeat(${COLS}, ${CARD_W}px);
    gap: ${GAP}px;
}
.card {
    width: ${CARD_W}px;
    background: #fff;
    border-radius: 2px 4px 3px 3px;
    overflow: hidden;
    box-shadow: rgba(0,0,0,0.1) 0 1px 6px;
}
.avatar {
    width: ${CARD_W}px;
    height: ${IMAGE_H}px;
    background-color: #dadada;
    background-size: cover;
    background-position: top center;
    position: relative;
}
.badge-col {
    position: absolute;
    top: 4px;
    left: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.badge {
    width: 15px;
    height: 15px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.profession-badge {
    background: #444;
}
.element-badge {
    background: #21c6d0; /* fallback; overridden per-element via inline style */
}
.badge-icon {
    width: 13px;
    height: 13px;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    filter: brightness(0) invert(1);
}
.avatar-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 22px;
    background: linear-gradient(transparent, rgba(0,0,0,0.6));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 2px;
}
.level-section {
    display: flex;
    align-items: center;
    gap: 2px;
}
.level-text {
    font-size: 9px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 0 1px rgba(0,0,0,0.4);
    line-height: 1;
}
.level-num {
    font-size: 13px;
}
.info-tag {
    font-size: 7px;
    font-weight: 700;
    line-height: 1;
    padding: 1px 2px;
    border-radius: 2px;
    border: 1px solid;
    white-space: nowrap;
}
.potential-tag {
    color: #ffd700;
    border-color: #ffd700;
    background: rgba(0,0,0,0.45);
}
.evolve-tag {
    font-size: 7px;
    font-weight: 700;
    line-height: 1;
    padding: 1px 3px;
    border-radius: 2px;
    white-space: nowrap;
    color: #fff;
    flex-shrink: 0;
    background: rgba(0,0,0,0.45);
}
.name {
    height: ${NAME_H}px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2px;
    font-size: 10px;
    font-weight: 700;
    color: #292929;
    padding: 0 6px; /* 稍微增加左右內邊距 */
    overflow: hidden;
    /* border-bottom: 3px solid ... ; <-- 這裡刪除了 */
}
.name-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
}
.weapon {
    height: ${WEAPON_H}px;
    background: #f9f9f9;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px;
    gap: 4px;
    border-top: 1px solid #eee; /* 名稱與武器之間的細分割線 */
}

.weapon-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    flex: 1;
}

.weapon-name {
    font-size: 8px;
    font-weight: 700;
    color: #333333; /* 深灰文字 */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
}

.weapon-level {
    font-size: 7px;
    color: #999999; /* 輔助文字顏色 */
    font-family: 'Verdana', sans-serif;
    margin-top: 1px;
}

.weapon-icon {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    background-color: #ffffff; /* 圖示底色 */
    border: 1px solid #f0f0f0;
    border-radius: 1px;
}
.rarity-line {
    height: 4px; /* 增加到 4px 會更有質感 */
    width: 100%;
    flex-shrink: 0;
}
.footer {
    margin-top: 10px;
    padding: 0 2px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    color: #888;
    border-top: 1px solid #eee;
    padding-top: 6px;
    white-space: nowrap;
}
.footer-left {
    display: flex;
    gap: 10px;
}
.footer-bot {
    color: #aaa;
}
</style>
</head>
<body>
<div id="wrapper">
  <div class="grid">
${cardsHtml}
  </div>
  <div class="footer">
    <div class="footer-left">
      ${safeUid ? `<span>UID: ${safeUid}</span>` : ''}
      ${safeServerName ? `<span>Server: ${safeServerName}</span>` : ''}
    </div>
    <span class="footer-bot">${safeBotName}</span>
  </div>
</div>
</body>
</html>`;
}

module.exports = { generateOperatorsHtml, COLS, CARD_W, IMAGE_H, NAME_H, WEAPON_H, GAP, PADDING };
