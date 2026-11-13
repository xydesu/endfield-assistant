/**
 * @file test_crisis_render.js
 * @description 驗證危機合約 Phase 1 / Phase 2 主題判斷、資料容錯與 Canvas 圖卡渲染
 */

const assert = require('assert');
const { createCanvas, loadImage } = require('canvas');
const { drawCrisisUI, detectCrisisPhase } = require('../utils/crisisCanvas');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function assertValidPng(buffer, label) {
    assert(Buffer.isBuffer(buffer), `${label}: 輸出必須為 Buffer`);
    assert(buffer.length > 5000, `${label}: PNG 大小過小 (${buffer.length} bytes)`);
    assert(buffer.subarray(0, 8).equals(PNG_MAGIC), `${label}: 檔頭非有效 PNG`);
}

function makeIndicators(count) {
    return Array.from({ length: count }, (_, idx) => ({
        id: `ind_${idx + 1}`,
        icon: '',
        name: `指標 ${idx + 1}`,
        score: (idx % 3) + 1,
    }));
}

function makeChar(id, level, potentialLevel, weaponId, terms, rarityKey = 'rarity_6') {
    const rarityNum = (rarityKey.match(/\d+/) || ['6'])[0];
    return {
        charId: id,
        level,
        potentialLevel,
        avatarUrl: '',
        rarity: { key: rarityKey, value: rarityNum },
        weapon: {
            id: weaponId,
            icon: '',
            level: 90,
            refineLevel: potentialLevel,
            weaponTerms: terms,
            rarity: { key: rarityKey, value: rarityNum },
        },
        equips: {
            bodyEquip: { id: 'b1', icon: '', enhanceStatus: 3, rarity: { key: 'equip_rarity_5', value: '金色品質' } },
            armEquip: { id: 'a1', icon: '', enhanceStatus: 2, rarity: { key: 'equip_rarity_5', value: '金色品質' } },
            firstAccessory: { id: 'f1', icon: '', enhanceStatus: 1, rarity: { key: 'equip_rarity_4', value: '紫色品質' } },
            secondAccessory: { id: 's1', icon: '', enhanceStatus: 3, rarity: { key: 'equip_rarity_6', value: '紅色品質' } },
        },
    };
}

async function runTests() {
    console.log('1. 測試 detectCrisisPhase 主題偵測...');
    assert.strictEqual(
        detectCrisisPhase(
            { data: { crisisContract: { dungeon: { originalId: 'indie_contract001' } } } },
            { data: { recordDetail: { id: 'indie_contract001-123' } } },
            '危機合約 重燃測試'
        ),
        1,
        'indie_contract001 應判定為 Phase 1'
    );
    assert.strictEqual(
        detectCrisisPhase({}, {}, '危機合約 重燃測試'),
        1,
        '名稱含重燃測試應判定為 Phase 1'
    );
    assert.strictEqual(
        detectCrisisPhase(
            { data: { crisisContract: { dungeon: { originalId: 'indie_contract002' } } } },
            { data: { recordDetail: { id: 'indie_contract002-123' } } },
            '危機合約 浸藍測試作戰'
        ),
        2,
        'indie_contract002 應判定為 Phase 2'
    );
    console.log('   通過');

    const charMetaMap = new Map([
        ['char_1', { id: 'char_1', profession: { key: 'profession_supporter' }, weaponType: { key: 'weapon_type_wand' } }],
        ['char_2', { id: 'char_2', profession: { key: 'profession_vanguard' }, weaponType: { key: 'weapon_type_lance' } }],
        ['char_3', { id: 'char_3', profession: { key: 'profession_guard' }, weaponType: { key: 'weapon_type_sword' } }],
        ['char_4', { id: 'char_4', profession: { key: 'profession_caster' }, weaponType: { key: 'weapon_type_wand' } }],
    ]);

    console.log('2. 測試 Phase 2 通關渲染（36 分／18 指標／新紀錄）...');
    const indicators18 = makeIndicators(18);
    const phase2PassBase = {
        data: {
            crisisContract: {
                dungeon: { originalId: 'indie_contract002' },
                history: {
                    bestRecord: {
                        id: 'indie_contract002-rec1',
                        passTs: '355',
                        isPass: true,
                        isBest: true,
                        passWave: 3,
                        indicatorCount: 36,
                    },
                },
            },
        },
    };
    const phase2PassDetail = {
        data: {
            recordDetail: {
                id: 'indie_contract002-rec1',
                passTs: '355',
                isPass: true,
                isBest: true,
                passWave: 3,
                indicatorCount: 36,
                indicators: indicators18,
                indicatorIds: indicators18.map(i => i.id),
                chars: [
                    makeChar('char_1', 90, 1, 'wpn_wand_0001', [9, 9, 7], 'rarity_6'),
                    makeChar('char_2', 90, 0, 'wpn_lance_0007', [9, 9, 4], 'rarity_6'),
                    makeChar('char_3', 90, 2, 'wpn_sword_0003', [9, 9, 4], 'rarity_6'),
                    makeChar('char_4', 90, 5, 'wpn_pistol_0002', [4, 4, 7], 'rarity_5'),
                ],
            },
        },
    };
    const bufP2Pass = await drawCrisisUI(phase2PassBase, phase2PassDetail, '400000001', '2', '危機合約 浸藍測試作戰', 'zh_Hant', {
        originalId: 'indie_contract002',
        charMetaMap,
    });
    assertValidPng(bufP2Pass, 'Phase 2 通關渲染');

    const countBrightPixels = async (pngBuf, x, y, w, h) => {
        const img = await loadImage(pngBuf);
        const cvs = createCanvas(img.width, img.height);
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(x, y, w, h).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) count++;
        }
        return count;
    };
    const passSanctumWhite = await countBrightPixels(bufP2Pass, 100, 675, 55, 55);
    assert(passSanctumWhite > 200, `Phase 2 通關時應顯示聖所評喻白色徽章 (white=${passSanctumWhite})`);

    // 驗證聖所右側數字方框依實機已確認門檻變色（9 分灰、20 分金、30 分紅）
    const renderWithScore = async (score) => {
        const b = JSON.parse(JSON.stringify(phase2PassBase));
        b.data.crisisContract.history.bestRecord.indicatorCount = score;
        const d = JSON.parse(JSON.stringify(phase2PassDetail));
        d.data.recordDetail.indicatorCount = score;
        return drawCrisisUI(b, d, '400000001', '2', '危機合約 浸藍測試作戰', 'zh_Hant', {
            originalId: 'indie_contract002',
            charMetaMap,
        });
    };
    const readRegion = async (pngBuf, x, y, w, h) => {
        const img = await loadImage(pngBuf);
        const cvs = createCanvas(img.width, img.height);
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(x, y, w, h).data;
    };
    const [px9, px20, px30] = await Promise.all([
        readRegion(await renderWithScore(9), 600, 620, 140, 110),
        readRegion(await renderWithScore(20), 600, 620, 140, 110),
        readRegion(await renderWithScore(30), 600, 620, 140, 110),
    ]);
    let cnt20 = 0; let r9 = 0; let g9 = 0; let b9 = 0; let r20 = 0; let g20 = 0; let b20 = 0;
    let cnt30 = 0; let r30 = 0; let g30 = 0; let b30 = 0;
    for (let i = 0; i < px9.length; i += 4) {
        if (Math.abs(px20[i] - px9[i]) + Math.abs(px20[i + 1] - px9[i + 1]) + Math.abs(px20[i + 2] - px9[i + 2]) > 50) {
            cnt20++;
            r9 += px9[i]; g9 += px9[i + 1]; b9 += px9[i + 2];
            r20 += px20[i]; g20 += px20[i + 1]; b20 += px20[i + 2];
        }
        if (Math.abs(px30[i] - px9[i]) + Math.abs(px30[i + 1] - px9[i + 1]) + Math.abs(px30[i + 2] - px9[i + 2]) > 50) {
            cnt30++;
            r30 += px30[i]; g30 += px30[i + 1]; b30 += px30[i + 2];
        }
    }
    assert(cnt20 > 200 && cnt30 > 200, `聖所分數方框隨分數變色差異像素應顯著 (cnt20=${cnt20}, cnt30=${cnt30})`);
    assert(Math.abs(r9 - g9) / cnt20 < 15 && Math.abs(g9 - b9) / cnt20 < 15, '9 分應呈現中性灰色');
    assert(r20 > b20 * 2 && g20 > b20 * 2, `20 分應呈現金色 (R=${r20}, G=${g20}, B=${b20})`);
    assert(r30 > g30 * 1.5 && r30 > b30 * 1.5, `30 分應呈現紅色 (R=${r30}, G=${g30}, B=${b30})`);
    console.log(`   通過 (${bufP2Pass.length} bytes)`);

    console.log('3. 測試 Phase 2 失敗／殘缺資料容錯渲染（22 指標／缺武器裝備）...');
    const indicators22 = makeIndicators(22);
    const phase2FailBase = {
        data: {
            crisisContract: {
                dungeon: { originalId: 'indie_contract002' },
                history: {
                    bestRecord: {
                        id: 'indie_contract002-rec2',
                        passTs: '185',
                        isPass: false,
                        isBest: false,
                        passWave: 1,
                        indicatorCount: 22,
                    },
                },
            },
        },
    };
    const phase2FailDetail = {
        data: {
            recordDetail: {
                id: 'indie_contract002-rec2',
                passTs: '185',
                isPass: false,
                isBest: false,
                passWave: 1,
                indicatorCount: 22,
                indicators: indicators22,
                indicatorIds: indicators22.map(i => i.id),
                chars: [
                    { charId: 'unknown_char', level: 80, potentialLevel: 0, weapon: null, equips: null },
                ],
            },
        },
    };
    const bufP2Fail = await drawCrisisUI(phase2FailBase, phase2FailDetail, '400000001', '3', '危機合約 浸藍測試作戰', 'en');
    assertValidPng(bufP2Fail, 'Phase 2 失敗與容錯渲染');
    const failSanctumWhite = await countBrightPixels(bufP2Fail, 100, 745, 55, 55);
    assert(failSanctumWhite < 30, `Phase 2 失敗時不應渲染聖所評喻橫幅 (white=${failSanctumWhite})`);
    console.log(`   通過 (${bufP2Fail.length} bytes)`);

    console.log('4. 測試 Phase 1（重燃測試）相容渲染...');
    const phase1Base = {
        data: {
            crisisContract: {
                dungeon: { originalId: 'indie_contract001' },
                history: {
                    bestRecord: {
                        id: 'indie_contract001-rec1',
                        passTs: '240',
                        indicatorCount: 28,
                    },
                },
            },
        },
    };
    const phase1Detail = {
        data: {
            recordDetail: {
                id: 'indie_contract001-rec1',
                passTs: '240',
                indicatorCount: 28,
                indicators: indicators18,
                indicatorIds: indicators18.slice(0, 10).map(i => i.id),
                chars: [
                    makeChar('char_1', 90, 1, 'wpn_wand_0001', [9, 9, 4]),
                ],
            },
        },
    };
    const bufP1 = await drawCrisisUI(phase1Base, phase1Detail, '400000001', '2', '危機合約 重燃測試', 'zh_Hant');
    assertValidPng(bufP1, 'Phase 1 相容渲染');
    console.log(`   通過 (${bufP1.length} bytes)`);

    console.log('5. 測試 Phase 2 英文版標題與 >27 指標溢出渲染...');
    const indicators32 = makeIndicators(32);
    const phase2EnBase = {
        data: {
            crisisContract: {
                dungeon: { originalId: 'indie_contract002' },
                history: {
                    bestRecord: {
                        id: 'indie_contract002-rec3',
                        passTs: '310',
                        isBest: true,
                        passWave: 3,
                        indicatorCount: 32,
                    },
                },
            },
        },
    };
    const phase2EnDetail = {
        data: {
            recordDetail: {
                id: 'indie_contract002-rec3',
                passTs: '310',
                isBest: true,
                passWave: 3,
                indicatorCount: 32,
                indicators: indicators32,
                indicatorIds: indicators32.map(i => i.id),
                chars: [
                    makeChar('char_1', 90, 5, 'wpn_wand_0001', [9, 9, 9], 'rarity_6'),
                    { charId: 'char_2', level: 80, potentialLevel: 1, weapon: null, equips: {} },
                ],
            },
        },
    };
    const bufP2En = await drawCrisisUI(phase2EnBase, phase2EnDetail, '400000001', '3', 'Beta Contract', 'en');
    assertValidPng(bufP2En, 'Phase 2 英文版與 >27 指標渲染');
    console.log(`   通過 (${bufP2En.length} bytes)`);

    console.log('\n所有危機合約渲染測試全數通過！');
}

runTests().catch(err => {
    console.error('測試失敗:', err);
    process.exit(1);
});
