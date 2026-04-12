const { ELEMENT_ICONS, ELEMENT_COLORS, RARITY_COLORS, getProfessionIcons } = require('./operatorEnums');

const COLS = 6;
const CARD_W = 84;
const IMAGE_H = 120;
const NAME_H = 26;
const WEAPON_H = 36;
const GAP = 8;
const PADDING = 16;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function generateOperatorsHtml(chars) {
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
        const weaponName = escapeHtml(char.weapon?.name || '');
        const weaponLevel = char.weapon?.level || 0;
        const weaponIconUrl = escapeHtml(char.weapon?.Url || '');

        return `<div class="card">
  <div class="avatar" style="background-image:url('${avatarUrl}');">
    <div class="badge-col">
      ${professionIconUrl ? `<div class="badge profession-badge"><div class="badge-icon" style="background-image:url('${professionIconUrl}');"></div></div>` : ''}
      ${elementIconUrl ? `<div class="badge element-badge" style="background:${elementBgColor};"><div class="badge-icon" style="background-image:url('${elementIconUrl}');"></div></div>` : ''}
    </div>
    <div class="avatar-bottom">
      ${potentialLevel > 0 ? `<div class="info-tag potential-tag">潛${potentialLevel}</div>` : '<span></span>'}
      <div class="level-section">
        <div class="level-text">Lv.<span class="level-num">${level}</span></div>
      </div>
    </div>
  </div>
  <div class="name" style="border-bottom:3px solid ${rarityColor};">
    <span class="name-text">${name}</span>
    ${evolvePhase > 0 ? `<div class="evolve-tag">菁英化${evolvePhase}</div>` : ''}
  </div>
  ${weaponName ? `<div class="weapon" style="border:1px solid ${rarityColor};">
    <div class="weapon-info">
      <div class="weapon-name">${weaponName}</div>
      <div class="weapon-level">Lv.${weaponLevel}</div>
    </div>
    ${weaponIconUrl ? `<div class="weapon-icon" style="background-image:url('${weaponIconUrl}');"></div>` : ''}
  </div>` : ''}
</div>`;
    }).join('\n');

    const rows = Math.ceil(sorted.length / COLS);
    const containerW = COLS * CARD_W + (COLS - 1) * GAP + PADDING * 2;
    const containerH = rows * (IMAGE_H + NAME_H + WEAPON_H) + (rows - 1) * GAP + PADDING * 2;

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
    padding: 0 3px;
    overflow: hidden;
}
.name-text {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
}
.weapon {
    height: ${WEAPON_H}px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 4px;
    gap: 3px;
    overflow: hidden;
}
.weapon-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    flex: 1;
}
.weapon-name {
    font-size: 8px;
    font-weight: 700;
    color: #292929;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
}
.weapon-level {
    font-size: 7px;
    color: #666;
    line-height: 1;
}
.weapon-icon {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
}
</style>
</head>
<body>
<div id="wrapper">
  <div class="grid">
${cardsHtml}
  </div>
</div>
</body>
</html>`;
}

module.exports = { generateOperatorsHtml, COLS, CARD_W, IMAGE_H, NAME_H, WEAPON_H, GAP, PADDING };
