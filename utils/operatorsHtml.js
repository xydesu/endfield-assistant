const RARITY_COLORS = {
    '6': '#FFB800',
    '5': '#C0A0FF',
    '4': '#00C8FF',
    '3': '#808080',
    '2': '#555555',
    '1': '#333333',
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function generateOperatorsHtml(chars) {
    const COLS = 6;
    const CARD_W = 84;
    const IMAGE_H = 110;
    const NAME_H = 30;
    const GAP = 8;
    const PADDING = 16;

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
        const avatarUrl = escapeHtml(char.charData?.avatarSqUrl || '');
        const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS['3'];

        return `<div class="card" style="border-top:3px solid ${rarityColor};">
  <div class="avatar" style="background-image:url('${avatarUrl}');">
    <div class="level-badge">Lv.${level}</div>
  </div>
  <div class="name">${name}</div>
</div>`;
    }).join('\n');

    const rows = Math.ceil(sorted.length / COLS);
    const containerW = COLS * CARD_W + (COLS - 1) * GAP + PADDING * 2;
    const containerH = rows * (IMAGE_H + NAME_H) + (rows - 1) * GAP + PADDING * 2;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: #1a1a1a;
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
    background: #2c2c2c;
    border-radius: 2px 4px 3px 3px;
    overflow: hidden;
    box-shadow: rgba(0,0,0,0.25) 0 2px 6px;
}
.avatar {
    width: ${CARD_W}px;
    height: ${IMAGE_H}px;
    background-color: #dadada;
    background-size: cover;
    background-position: top center;
    position: relative;
}
.level-badge {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(0,0,0,0.75));
    padding: 10px 4px 3px;
    font-size: 11px;
    font-weight: bold;
    color: #fff;
    text-align: center;
}
.name {
    height: ${NAME_H}px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: #e0e0e0;
    padding: 0 3px;
    text-align: center;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
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

module.exports = { generateOperatorsHtml };
