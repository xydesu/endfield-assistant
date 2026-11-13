/**
 * @file test_crisis_render.js
 * @description 驗證危機合約 Phase 1 / Phase 2 主題判斷、資料容錯與 Canvas 圖卡渲染
 */

const assert = require('assert');
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
            refineLevel: 0,
            weaponTerms: terms,
            rarity: { key: 'rarity_6', value: '6' },
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

    console.log('\n所有危機合約渲染測試全數通過！');
}

runTests().catch(err => {
    console.error('測試失敗:', err);
    process.exit(1);
});
