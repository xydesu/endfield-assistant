/**
 * @file fetch_snapshot.js
 * @description 從森空島 (SKPort / SKLand) 擷取最新遊戲資料快照並儲存至 data/ 目錄，支援資產預熱下載與原子寫入
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { getBindingList, getCardDetail, getIndieHardDetail } = require('../utils/attendance');
const { encrypt } = require('../utils/encryption');
const User = require('../models/User');

const PROJ_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJ_ROOT, 'data');
const DYNAMIC_DIR = path.join(PROJ_ROOT, 'assets', 'images', 'dynamic');

function printUsage() {
    console.log(`
使用方式:
  node scripts/fetch_snapshot.js [選項]

選項:
  --cred <CRED>         指定森空島憑證 (cred)
  --uid <UID>           指定目標角色 UID (選填，若未指定將抓取首個有效角色)
  --server <SERVER_ID>  指定伺服器代號 (預設為 2 - Asia)
  --save                將擷取結果安全儲存至 data/data.json 與 data/indie-hard.json (採用原子覆蓋)
  --update-db           同步更新資料庫中對應使用者的 cred
  --warmup-assets       自動遍歷所有幹員與豐碑關卡圖片，預熱下載快取至 assets/images/dynamic/
  --concurrency <N>     資產下載並行數 (預設為 6)
  --help                顯示說明文件
`);
}

async function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {
        cred: null,
        uid: null,
        serverId: '2',
        save: false,
        updateDb: false,
        warmupAssets: false,
        concurrency: 6
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        } else if (arg === '--cred' && i + 1 < args.length) {
            parsed.cred = args[++i];
        } else if (arg === '--uid' && i + 1 < args.length) {
            parsed.uid = args[++i];
        } else if (arg === '--server' && i + 1 < args.length) {
            parsed.serverId = args[++i];
        } else if (arg === '--save') {
            parsed.save = true;
        } else if (arg === '--update-db') {
            parsed.updateDb = true;
        } else if (arg === '--warmup-assets') {
            parsed.warmupAssets = true;
        } else if (arg === '--concurrency' && i + 1 < args.length) {
            parsed.concurrency = parseInt(args[++i], 10) || 6;
        }
    }

    return parsed;
}

/**
 * 遞迴從物件中提取所有圖片 URL
 */
function extractAllImageUrls(obj, set = new Set()) {
    if (!obj) return set;
    if (typeof obj === 'string') {
        const trimmed = obj.trim();
        if (
            (/^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(trimmed)) ||
            (trimmed.startsWith('http') && trimmed.includes('/image/'))
        ) {
            set.add(trimmed);
        }
    } else if (Array.isArray(obj)) {
        for (const item of obj) {
            extractAllImageUrls(item, set);
        }
    } else if (typeof obj === 'object') {
        for (const val of Object.values(obj)) {
            extractAllImageUrls(val, set);
        }
    }
    return set;
}

/**
 * 下載單一圖片檔案，支援原子替換與超時防護
 */
function downloadImageFile(url, destPath, retries = 2) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const tmpPath = `${destPath}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const file = fs.createWriteStream(tmpPath);
        let isAborted = false;

        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, (res) => {
            // 處理 301 / 302 重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                return downloadImageFile(res.headers.location, destPath, retries).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                file.close();
                if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                if (retries > 0) {
                    return setTimeout(() => downloadImageFile(url, destPath, retries - 1).then(resolve).catch(reject), 500);
                }
                return reject(new Error(`HTTP ${res.statusCode} 下載失敗: ${url}`));
            }

            res.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    try {
                        const stat = fs.statSync(tmpPath);
                        if (stat.size === 0) {
                            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
                            return reject(new Error(`下載檔案為空 (0 byte): ${url}`));
                        }
                        // 原子替換
                        try {
                            fs.renameSync(tmpPath, destPath);
                        } catch (renameErr) {
                            fs.copyFileSync(tmpPath, destPath);
                            fs.unlinkSync(tmpPath);
                        }
                        resolve(destPath);
                    } catch (err) {
                        reject(err);
                    }
                });
            });
        });

        req.on('error', (err) => {
            isAborted = true;
            file.close();
            if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => {});
            if (retries > 0) {
                return setTimeout(() => downloadImageFile(url, destPath, retries - 1).then(resolve).catch(reject), 500);
            }
            reject(err);
        });

        req.setTimeout(12000, () => {
            if (!isAborted) {
                req.destroy();
                file.close();
                if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => {});
                if (retries > 0) {
                    return setTimeout(() => downloadImageFile(url, destPath, retries - 1).then(resolve).catch(reject), 500);
                }
                reject(new Error(`下載超時 (12s): ${url}`));
            }
        });
    });
}

/**
 * 資產全量預熱下載
 */
async function warmupAssets(detail, indieHard, options = {}) {
    const concurrency = options.concurrency || 6;
    console.log('\n===========================================');
    console.log('🔄 開始執行資產預熱下載 (Asset Warmup)...');
    console.log('===========================================');

    if (!fs.existsSync(DYNAMIC_DIR)) {
        fs.mkdirSync(DYNAMIC_DIR, { recursive: true });
    }

    const allUrls = new Set();
    if (detail) extractAllImageUrls(detail, allUrls);
    if (indieHard) extractAllImageUrls(indieHard, allUrls);

    console.log(`📦 掃描到的唯一圖片資源總數: ${allUrls.size}`);

    const tasks = [];
    let alreadyCachedCount = 0;

    for (const url of allUrls) {
        let filename;
        try {
            const parsedUrl = new URL(url);
            const pathname = parsedUrl.pathname;
            filename = pathname.substring(pathname.lastIndexOf('/') + 1);
        } catch (e) {
            filename = url.substring(url.lastIndexOf('/') + 1);
        }

        if (filename.includes('?')) {
            filename = filename.split('?')[0];
        }

        if (!filename) {
            filename = `img_${Date.now()}.png`;
        }

        const destPath = path.join(DYNAMIC_DIR, filename);
        if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
            alreadyCachedCount++;
        } else {
            tasks.push({ url, destPath, filename });
        }
    }

    console.log(`⚡ 已存在快取資源: ${alreadyCachedCount} 個`);
    console.log(`📥 待下載資源: ${tasks.length} 個 (並行連線數: ${concurrency})`);

    let completed = 0;
    let failed = 0;

    // 並行隊列處理
    let index = 0;
    async function worker() {
        while (index < tasks.length) {
            const currentIndex = index++;
            const item = tasks[currentIndex];
            try {
                await downloadImageFile(item.url, item.destPath);
                completed++;
                if (completed % 10 === 0 || completed === tasks.length) {
                    process.stdout.write(`\r   進度: [${completed}/${tasks.length}] (${Math.floor((completed / tasks.length) * 100)}%) 下載中...`);
                }
            } catch (err) {
                failed++;
                console.warn(`\n   ⚠️ 下載失敗 [${item.filename}]: ${err.message}`);
            }
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
        workers.push(worker());
    }

    await Promise.all(workers);

    console.log(`\n✅ 資產預熱完成！本次新增下載: ${completed} 個，失敗: ${failed} 個，當前動態目錄累積資源: ${alreadyCachedCount + completed} 個。\n`);
    return {
        totalUrls: allUrls.size,
        alreadyCached: alreadyCachedCount,
        downloaded: completed,
        failed
    };
}

/**
 * 安全原子寫入 JSON 檔案
 */
function atomicWriteJson(filePath, dataObj) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const content = JSON.stringify(dataObj, null, 2);
    // 預先校驗 JSON 是否有效
    JSON.parse(content);

    const tmpPath = `${filePath}.tmp_${Date.now()}`;
    fs.writeFileSync(tmpPath, content, 'utf8');

    // 驗證寫入的臨時檔案可被正確解析且長度大於 0
    const verifyContent = fs.readFileSync(tmpPath, 'utf8');
    if (!verifyContent || verifyContent.length === 0) {
        fs.unlinkSync(tmpPath);
        throw new Error(`臨時檔案寫入為空: ${tmpPath}`);
    }
    JSON.parse(verifyContent);

    // 原子覆蓋
    try {
        fs.renameSync(tmpPath, filePath);
    } catch (renameErr) {
        fs.copyFileSync(tmpPath, filePath);
        fs.unlinkSync(tmpPath);
    }
}

async function main() {
    const opts = await parseArgs();

    let rawCred = opts.cred;

    // 若未手動提供憑證，嘗試自資料庫尋找使用者
    if (!rawCred) {
        console.log('未提供 --cred 參數，正在嘗試從資料庫讀取已儲存之使用者...');
        try {
            const user = await User.findOne();
            if (user && user.cred) {
                const { decrypt } = require('../utils/encryption');
                rawCred = decrypt(user.cred);
                opts.uid = opts.uid || user.uid;
                opts.serverId = opts.serverId || user.serverId;
                console.log(`已從資料庫載入使用者: UID=${user.uid}, 伺服器=${user.serverId}`);
            }
        } catch (err) {
            console.warn('無法自資料庫載入使用者:', err.message);
        }
    }

    if (!rawCred) {
        console.error('❌ 錯誤: 未提供森空島 cred 憑證，且資料庫中無可用使用者。');
        printUsage();
        process.exit(1);
    }

    console.log('正在透過森空島 API 查詢綁定角色清單...');
    let roles = [];
    try {
        roles = await getBindingList(rawCred);
    } catch (err) {
        console.warn(`⚠️ 查詢角色清單時發生異常: ${err.message}`);
    }

    let targetRole = null;

    if (roles && roles.length > 0) {
        console.log(`成功獲取角色清單 (共 ${roles.length} 個角色):`);
        roles.forEach((r, idx) => {
            console.log(`  [${idx + 1}] 暱稱: ${r.nickname || '未知'} | UID: ${r.roleId} | 伺服器: ${r.serverName} (${r.serverId}) | 等級: Lv.${r.level}`);
        });

        if (opts.uid) {
            const found = roles.find(r => r.roleId === opts.uid);
            if (found) {
                targetRole = found;
            } else {
                console.warn(`⚠️ 清單中未找到指定 UID (${opts.uid})，使用手動指定之 UID 與伺服器配置。`);
                targetRole = { roleId: opts.uid, serverId: opts.serverId || '2', nickname: opts.uid };
            }
        } else {
            targetRole = roles[0];
        }
    } else {
        // 容錯防護：若 getBindingList 失敗或未找到角色，但已提供 --uid，不應強制中止
        if (opts.uid) {
            console.log(`ℹ️ 角色清單查詢為空，但已指定 --uid (${opts.uid})，將直接嘗試請求角色與豐碑資料 (伺服器: ${opts.serverId})...`);
            targetRole = { roleId: opts.uid, serverId: opts.serverId || '2', nickname: opts.uid };
        } else {
            console.error('❌ 未找到任何綁定的《明日方舟：終末地》遊戲角色，且未指定 --uid。');
            process.exit(1);
        }
    }

    const encryptedCred = encrypt(rawCred);
    const mockUser = {
        uid: targetRole.roleId,
        serverId: targetRole.serverId,
        cred: encryptedCred,
        language: 'zh_Hant'
    };

    console.log(`\n正在擷取角色 [${targetRole.nickname || targetRole.roleId}] (UID: ${targetRole.roleId}, 伺服器: ${targetRole.serverId}) 之卡片詳情...`);
    const cardRes = await getCardDetail(mockUser);
    if (!cardRes || !cardRes.success || !cardRes.detail) {
        console.error('❌ 擷取卡片詳情失敗:', cardRes ? cardRes.message : '無回應');
        process.exit(1);
    }

    // 防空資料檢查 (Sanity Check)
    if (!Array.isArray(cardRes.detail.chars) || cardRes.detail.chars.length === 0) {
        console.error('❌ 擷取到的幹員清單為空，拒絕寫入以防快照損毀！');
        process.exit(1);
    }
    console.log(`✅ 卡片詳情擷取成功！幹員數量: ${cardRes.detail.chars.length}`);

    console.log('正在擷取影拓豐碑詳情...');
    const indieRes = await getIndieHardDetail(mockUser);
    if (!indieRes || !indieRes.success || !indieRes.indieHard) {
        console.error('❌ 擷取影拓豐碑詳情失敗:', indieRes ? indieRes.message : '無回應');
        process.exit(1);
    }

    // 防空資料檢查 (Sanity Check)
    if (!Array.isArray(indieRes.indieHard.indieHardGroups) || indieRes.indieHard.indieHardGroups.length === 0) {
        console.error('❌ 擷取到的影拓豐碑組為空，拒絕寫入以防快照損毀！');
        process.exit(1);
    }
    console.log(`✅ 影拓豐碑詳情擷取成功！關卡組數: ${indieRes.indieHard.indieHardGroups.length}`);

    if (opts.save) {
        const dataJsonPayload = {
            code: 0,
            message: 'OK',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            data: { detail: cardRes.detail }
        };
        const indieJsonPayload = {
            code: 0,
            message: 'OK',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            data: { indieHard: indieRes.indieHard }
        };

        const dataPath = path.join(DATA_DIR, 'data.json');
        const indiePath = path.join(DATA_DIR, 'indie-hard.json');

        atomicWriteJson(dataPath, dataJsonPayload);
        atomicWriteJson(indiePath, indieJsonPayload);

        console.log(`\n💾 資料快照已通過原子替換安全儲存至:\n  - ${dataPath}\n  - ${indiePath}`);
    }

    // 若啟用資產預熱
    if (opts.warmupAssets) {
        await warmupAssets(cardRes.detail, indieRes.indieHard, { concurrency: opts.concurrency });
    }

    if (opts.updateDb) {
        try {
            const [affected] = await User.update(
                { cred: encryptedCred },
                { where: { uid: targetRole.roleId } }
            );
            if (affected > 0) {
                console.log(`🔑 資料庫使用者憑證已同步更新 (UID: ${targetRole.roleId})。`);
            } else {
                console.log(`ℹ️ 資料庫中無符合 UID (${targetRole.roleId}) 之既有紀錄，未執行更新。`);
            }
        } catch (err) {
            console.warn('⚠️ 更新資料庫時發生錯誤:', err.message);
        }
    }

    console.log('\n🎉 資料快照作業全數完成！');
}

module.exports = {
    extractAllImageUrls,
    downloadImageFile,
    warmupAssets,
    atomicWriteJson,
    main
};

if (require.main === module) {
    main().catch(err => {
        console.error('執行失敗:', err);
        process.exit(1);
    });
}
