/**
 * @file verify_data_render.js
 * @description 自動化驗證資料快照結構與圖卡渲染穩定性
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const PROJ_ROOT = path.resolve(__dirname, '..');
const dataJsonPath = path.join(PROJ_ROOT, 'data', 'data.json');
const indieJsonPath = path.join(PROJ_ROOT, 'data', 'indie-hard.json');

async function testDataSnapshots() {
    console.log('1. 驗證資料快照檔案存在性與基本結構...');
    assert(fs.existsSync(dataJsonPath), 'data/data.json 必須存在');
    assert(fs.existsSync(indieJsonPath), 'data/indie-hard.json 必須存在');

    const dataJson = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
    const indieJson = JSON.parse(fs.readFileSync(indieJsonPath, 'utf8'));

    assert(dataJson.code === 0, 'data.json code 必須為 0');
    assert(dataJson.data && dataJson.data.detail, 'data.json 必須包含 data.detail');
    assert(Array.isArray(dataJson.data.detail.chars), 'detail.chars 必須為陣列');
    assert(dataJson.data.detail.chars.length > 0, 'detail.chars 幹員數量不可為 0');

    assert(indieJson.code === 0, 'indie-hard.json code 必須為 0');
    assert(indieJson.data && indieJson.data.indieHard, 'indie-hard.json 必須包含 data.indieHard');
    assert(Array.isArray(indieJson.data.indieHard.indieHardGroups), 'indieHardGroups 必須為陣列');

    console.log(`✅ 快照驗證通過：幹員數量 = ${dataJson.data.detail.chars.length}，影拓豐碑組數 = ${indieJson.data.indieHard.indieHardGroups.length}`);
    return { dataJson, indieJson };
}

async function testOperatorsCanvasRender(dataJson) {
    console.log('\n2. 驗證幹員列表 Canvas 繪圖渲染 (operatorsCanvas)...');
    const { renderOperatorsCanvas } = require('../utils/operatorsCanvas');
    const chars = dataJson.data.detail.chars;

    const buffer = await renderOperatorsCanvas(chars, {
        uid: '4866844507',
        serverId: '2',
        botName: '終末地助手',
        lang: 'zh_Hant'
    });

    assert(Buffer.isBuffer(buffer), 'renderOperatorsCanvas 必須回傳 Buffer');
    assert(buffer.length > 100000, `生成的幹員名冊圖卡 Buffer 應大於 100KB (實際: ${buffer.length} bytes)`);

    console.log(`✅ 幹員列表 Canvas 繪圖測試通過！(大小: ${buffer.length} bytes)`);
}

async function testCharCanvasRender(dataJson) {
    console.log('\n3. 驗證幹員 Canvas 詳細配置圖卡渲染 (charRender)...');
    const { renderCharacter } = require('../utils/charRender');
    const chars = dataJson.data.detail.chars;

    // 隨機抽測前 3 位幹員
    const testCount = Math.min(3, chars.length);
    for (let i = 0; i < testCount; i++) {
        const char = chars[i];
        const charName = char.charData?.name || `Index_${i}`;
        console.log(`   正在測試幹員 [${charName}] 繪製...`);
        const buffer = await renderCharacter(char, '4866844507', 'zh_Hant');
        assert(Buffer.isBuffer(buffer), '繪圖結果必須為 Buffer');
        assert(buffer.length > 50000, '生成的圖卡 Buffer 應大於 50KB');
        console.log(`   ✅ [${charName}] 繪製成功 (大小: ${buffer.length} bytes)`);
    }

    console.log('✅ 幹員詳細配置繪圖渲染測試通過！');
}

async function testMonumentLogic(indieJson) {
    console.log('\n4. 驗證影拓豐碑資料解析邏輯...');
    const groups = indieJson.data.indieHard.indieHardGroups;
    assert(groups.length > 0, '影拓豐碑關卡組不可為空');

    let totalDungeons = 0;
    for (const group of groups) {
        assert(group.name, '關卡組必須有名稱');
        if (Array.isArray(group.dungeonGroups)) {
            totalDungeons += group.dungeonGroups.length;
        }
    }

    console.log(`✅ 影拓豐碑結構解析正常：共 ${groups.length} 組區域，累計 ${totalDungeons} 關！`);
}

async function testExploreCanvasRender(dataJson) {
    console.log('\n5. 驗證區域探索進度圖卡渲染 (explore)...');
    const { _generateExploreImage } = require('../commands/game/explore');
    const domains = dataJson.data.detail.domain;
    assert(Array.isArray(domains) && domains.length > 0, 'detail.domain 必須為非空陣列');

    const wulingDomain = domains.find(d => d.name === '武陵') || domains[0];
    console.log(`   正在測試探索圖卡 [${wulingDomain.name}] (Page 1) 繪製...`);
    const cardPage1 = await _generateExploreImage(wulingDomain, 'ja', 1);
    assert(cardPage1 && Buffer.isBuffer(cardPage1.buffer), '繪圖結果必須包含 Buffer');
    assert(cardPage1.buffer.length > 30000, '生成的探索圖卡 Buffer 應大於 30KB');
    console.log(`   ✅ [${wulingDomain.name}] 第 2 頁繪製成功 (大小: ${cardPage1.buffer.length} bytes)`);

    console.log('✅ 區域探索進度繪圖渲染測試通過！');
}

async function run() {
    console.log('=== 開始執行端到端資料與渲染驗證測試 ===\n');
    try {
        const { dataJson, indieJson } = await testDataSnapshots();
        await testOperatorsCanvasRender(dataJson);
        await testCharCanvasRender(dataJson);
        await testMonumentLogic(indieJson);
        await testExploreCanvasRender(dataJson);

        console.log('\n===========================================');
        console.log('🎉 所有資料與渲染自動化驗證測試全數通過！');
        console.log('===========================================');
    } catch (err) {
        console.error('\n❌ 驗證測試失敗:', err);
        process.exit(1);
    }
}

run();

