// 輔助函數：將簡體字轉為繁體字，防止名詞歧異
function toTraditional(str) {
    if (!str) return '';
    return str
        .replace(/大量伤害/g, '大量傷害')
        .replace(/燃烧/g, '燃燒')
        .replace(/落潮轻甲/g, '落潮輕甲')
        .replace(/动火用手甲/g, '動火用手甲')
        .replace(/动火用测温镜/g, '動火用測溫鏡')
        .replace(/优质锦草饮料/g, '優質錦草飲料')
        .replace(/熔铸火焰/g, '熔鑄火焰');
}

module.exports = {
    toTraditional
};
