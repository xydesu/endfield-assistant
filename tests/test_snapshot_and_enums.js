/**
 * @file test_snapshot_and_enums.js
 * @description 驗證快照容錯機制、原子性寫入與 operatorEnums 離線斷網解耦
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PROJ_ROOT = path.resolve(__dirname, '..');
const { extractAllImageUrls, atomicWriteJson } = require('../scripts/fetch_snapshot');
const { getProfessionIcons, ELEMENT_ICONS, loadProfessionIcons } = require('../utils/operatorEnums');

async function testOfflineEnums() {
    console.log('1. 測試 operatorEnums 在徹底斷網環境下的表現...');

    // 模擬斷網：攔截並禁止任何 http/https 網路請求
    const originalHttpsGet = https.get;
    const originalHttpsRequest = https.request;
    const originalHttpGet = http.get;
    const originalHttpRequest = http.request;

    https.get = https.request = http.get = http.request = function() {
        throw new Error('❌ 嚴禁在 operatorEnums 中發起外部網路請求！');
    };

    try {
        const icons = await getProfessionIcons();
        assert(icons && typeof icons === 'object', 'getProfessionIcons 必須回傳物件');

        // 驗證 6 種職業圖標
        const expectedProfessions = ['guard', 'defender', 'supporter', 'caster', 'assault', 'vanguard'];
        for (const prof of expectedProfessions) {
            const fullKey = `profession_${prof}`;
            assert(icons[fullKey], `缺少職業圖標: ${fullKey}`);
            assert(icons[fullKey].startsWith('data:image/png;base64,'), `${fullKey} 必須為 Data URI`);
            assert(icons[fullKey].length > 100, `${fullKey} Data URI 長度異常`);

            // 驗證簡寫 key
            assert(icons[prof], `缺少簡寫職業圖標: ${prof}`);
            assert(icons[prof] === icons[fullKey], `簡寫與完整 key 應一致: ${prof}`);

            // 驗證 active key
            const activeKey = `profession_${prof}Active`;
            assert(icons[activeKey], `缺少 active 職業圖標: ${activeKey}`);
            assert(icons[activeKey].startsWith('data:image/png;base64,'), `${activeKey} 必須為 Data URI`);
        }

        // 驗證 all 圖標
        assert(icons['all'], '缺少 all 圖標');
        assert(icons['all'].startsWith('data:image/png;base64,'), 'all 圖標必須為 Data URI');

        // 驗證 5 種屬性圖標
        const expectedProperties = ['physical', 'fire', 'pulse', 'cryst', 'natural'];
        for (const prop of expectedProperties) {
            const fullKey = `char_property_${prop}`;
            assert(ELEMENT_ICONS[fullKey], `缺少屬性圖標: ${fullKey}`);
            assert(ELEMENT_ICONS[fullKey].startsWith('data:image/png;base64,'), `${fullKey} 必須為 Data URI`);

            // 簡寫 key
            assert(ELEMENT_ICONS[prop], `缺少簡寫屬性圖標: ${prop}`);
        }

        console.log('   ✅ 斷網測試通過：6 種職業與 5 種屬性圖標均為本地 Base64 Data URI，零網路依賴！');
    } finally {
        // 恢復原函數
        https.get = originalHttpsGet;
        https.request = originalHttpsRequest;
        http.get = originalHttpGet;
        http.request = originalHttpRequest;
    }
}

async function testAtomicWrite() {
    console.log('\n2. 測試快照檔案原子性安全寫入...');
    const testFile = path.join(PROJ_ROOT, 'data', 'test_atomic.json');
    const testData = { code: 0, message: 'OK', test: true, ts: Date.now() };

    atomicWriteJson(testFile, testData);

    assert(fs.existsSync(testFile), '目標檔案必須存在');
    const readBack = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    assert.deepStrictEqual(readBack, testData, '寫入與讀出內容必須完全一致');

    // 測試寫入損壞資料會拋出錯誤且不損害現有目標檔
    let threw = false;
    try {
        const circular = {};
        circular.self = circular;
        atomicWriteJson(testFile, circular);
    } catch (e) {
        threw = true;
    }
    assert(threw, '寫入無效資料應拋出例外');

    // 確認原有檔案完好無損
    const stillIntact = JSON.parse(fs.readFileSync(testFile, 'utf8'));
    assert.deepStrictEqual(stillIntact, testData, '原有快照檔案未受損壞影響');

    // 清理測試檔案
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    console.log('   ✅ 原子性安全寫入與損毀防護測試通過！');
}

async function testClaymoresIcon() {
    console.log('\n3. 測試雙手劍圖標武器類型對齊...');
    const singlePath = path.join(PROJ_ROOT, 'assets', 'images', 'weapon', 'weapon_type_claymore.png');
    const pluralPath = path.join(PROJ_ROOT, 'assets', 'images', 'weapon', 'weapon_type_claymores.png');

    assert(fs.existsSync(singlePath), '單數 weapon_type_claymore.png 必須存在');
    assert(fs.existsSync(pluralPath), '複數 weapon_type_claymores.png 必須存在');

    const singleBuf = fs.readFileSync(singlePath);
    const pluralBuf = fs.readFileSync(pluralPath);
    assert.deepStrictEqual(singleBuf, pluralBuf, '單數與複數圖標內容必須完全一致');
    console.log(`   ✅ 雙手劍圖標對齊測試通過！(大小: ${pluralBuf.length} bytes)`);
}

async function testDynamicAssetsCoverage() {
    console.log('\n4. 測試動態圖片資源覆蓋率...');
    const dataJson = require('../data/data.json');
    const indieJson = require('../data/indie-hard.json');
    const dynamicDir = path.join(PROJ_ROOT, 'assets', 'images', 'dynamic');

    const allUrls = new Set();
    extractAllImageUrls(dataJson, allUrls);
    extractAllImageUrls(indieJson, allUrls);

    let missingCount = 0;
    for (const url of allUrls) {
        let filename;
        try {
            filename = new URL(url).pathname.split('/').pop();
        } catch (e) {
            filename = url.split('/').pop();
        }
        if (filename.includes('?')) filename = filename.split('?')[0];

        const localPath = path.join(dynamicDir, filename);
        if (!fs.existsSync(localPath) || fs.statSync(localPath).size === 0) {
            missingCount++;
        }
    }

    console.log(`   總掃描資源數: ${allUrls.size}，缺失數: ${missingCount}`);
    assert.strictEqual(missingCount, 0, '所有快照引用的圖片必須 100% 快取於本地');
    console.log('   ✅ 動態資源 100% 覆蓋率測試通過！');
}

async function run() {
    console.log('=== 開始執行 M1 & M2 深度功能驗證 ===\n');
    await testOfflineEnums();
    await testAtomicWrite();
    await testClaymoresIcon();
    await testDynamicAssetsCoverage();
    console.log('\n===========================================');
    console.log('🎉 所有 M1 & M2 功能驗證測試全數順利通過！');
    console.log('===========================================');
}

run().catch(err => {
    console.error('測試失敗:', err);
    process.exit(1);
});
