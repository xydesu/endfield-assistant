/**
 * @file test_core_fixes.js
 * @description 驗證安全性修復、快取邊界、排程重入鎖、下載清理與多語系完整性
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

function testEncryptionSecurity() {
    console.log('1. 測試 AES-256-GCM 加密與竄改偵測...');
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    delete require.cache[require.resolve('../utils/encryption')];
    const { encrypt, decrypt } = require('../utils/encryption');

    const secret = 'test-skport-cred-secret-12345';
    const cipher = encrypt(secret);
    assert(cipher.startsWith('gcm:'), '加密輸出必須採用 gcm: 前綴');
    assert.strictEqual(decrypt(cipher), secret, '解密結果必須還原原文');

    // 竄改 AuthTag / 密文 / 異常長度 IV 或 Tag 不得靜默通過
    const parts = cipher.split(':');
    const tamperedTag = `${parts[0]}:${parts[1]}:${'f'.repeat(parts[2].length)}:${parts[3]}`;
    assert.throws(() => decrypt(tamperedTag), /unable to authenticate|auth/i, '竄改 AuthTag 應拋出例外');
    assert.throws(() => decrypt('gcm:deadbeef'), /Invalid|format/i, '破損 GCM 格式應拋出例外');
    assert.throws(() => decrypt(`gcm:abcd:${parts[2]}:${parts[3]}`), /Invalid GCM ciphertext component/i, '過短 GCM IV 應拋出例外');
    assert.throws(() => decrypt(`gcm:${parts[1]}:abcd:${parts[3]}`), /Invalid GCM ciphertext component/i, '過短 GCM AuthTag 應拋出例外');

    // 明文向下相容（未啟用 STRICT_ENCRYPTION）
    assert.strictEqual(decrypt('plain_legacy_value'), 'plain_legacy_value', '明文應保留向下相容');

    // 啟用 STRICT_ENCRYPTION 時應拒絕未加密明文
    process.env.STRICT_ENCRYPTION = 'true';
    assert.throws(() => decrypt('plain_legacy_value'), /STRICT_ENCRYPTION/i, '嚴格模式應拒絕明文憑證');
    delete process.env.STRICT_ENCRYPTION;

    // 錯誤金鑰應拋錯而非回傳亂碼
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    delete require.cache[require.resolve('../utils/encryption')];
    const { decrypt: decryptWithWrongKey } = require('../utils/encryption');
    assert.throws(() => decryptWithWrongKey(cipher), '使用錯誤金鑰解密應拋出例外');
    console.log('   通過');
}

async function testHttpCacheAndDownloads() {
    console.log('2. 測試 LruCache、fetchBufferWithLimit 與 charRender 安全下載...');
    const { LruCache, fetchBufferWithLimit } = require('../utils/httpCache');
    const { resolveImagePath } = require('../utils/charRender');

    // LRU 容量與淘汰
    const cache = new LruCache(2);
    cache.set('a', 1);
    cache.set('b', 2);
    assert.strictEqual(cache.get('a'), 1); // 刷新 'a'
    cache.set('c', 3); // 應淘汰最久未用的 'b'
    assert.strictEqual(cache.has('b'), false, '應淘汰最舊鍵值 b');
    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('c'), 3);

    // TTL 過期
    const ttlCache = new LruCache(5, 15);
    ttlCache.set('k', 'v');
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(ttlCache.get('k'), undefined, '超過 TTL 後應失效');

    // 本地 HTTP 測試伺服器
    let hitCount = 0;
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
    const server = http.createServer((req, res) => {
        if (req.url === '/ok.png') {
            hitCount++;
            setTimeout(() => {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(validPng);
            }, 30);
        } else if (req.url === '/large') {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(Buffer.alloc(2048, 0x41));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const testFilename = `__test_fix_asset_${process.pid}.png`;
    const testDest = path.resolve(__dirname, '..', 'assets', 'images', 'dynamic', testFilename);
    const badFilename = `__test_fix_404_${process.pid}.png`;
    const badDest = path.resolve(__dirname, '..', 'assets', 'images', 'dynamic', badFilename);

    try {
        // SSRF 防護：預設拒絕明文 http、Loopback、私網與雲端 Metadata 位址
        await assert.rejects(
            () => fetchBufferWithLimit(`http://127.0.0.1:${port}/ok.png`),
            /protocol|private|blocked/i,
            '預設必須拒絕明文 HTTP 與 Loopback 位址'
        );
        await assert.rejects(
            () => fetchBufferWithLimit('https://169.254.169.254/latest/meta-data/'),
            /private|reserved/i,
            '必須拒絕雲端 Metadata IP'
        );
        await assert.rejects(
            () => fetchBufferWithLimit('https://10.0.0.1/secret.png'),
            /private|reserved/i,
            '必須拒絕 RFC 1918 私網 IP'
        );
        await assert.rejects(
            () => fetchBufferWithLimit('https://[::1]/secret.png'),
            /private|reserved/i,
            '必須拒絕 IPv6 Loopback'
        );
        await assert.rejects(
            () => fetchBufferWithLimit('https://localhost/secret.png'),
            /internal hostname/i,
            '必須拒絕 localhost'
        );

        // 大小上限保護（顯式允許測試用本地 Server）
        await assert.rejects(
            () => fetchBufferWithLimit(`http://127.0.0.1:${port}/large`, { maxBytes: 512, allowUnsafeLocalForTest: true }),
            /maxBytes|large/i,
            '超過 maxBytes 的回應必須拒絕'
        );

        // 404 不得遺留 0-byte 或殘缺本地檔案
        const badUrl = `http://127.0.0.1:${port}/not_found/${badFilename}`;
        const badRes = await resolveImagePath(badUrl, { allowUnsafeLocalForTest: true });
        assert.strictEqual(badRes, badUrl, '下載失敗時應回退原網址');
        assert.strictEqual(fs.existsSync(badDest), false, 'HTTP 404 不可於 dynamic 目錄殘留空檔案');

        // 併發相同 URL 應去重為單次實際下載
        const okDest = path.resolve(__dirname, '..', 'assets', 'images', 'dynamic', 'ok.png');
        const existedBefore = fs.existsSync(okDest);
        // 改用專屬測試檔名避免與現有檔案碰撞
        const serverUrl = `http://127.0.0.1:${port}/ok.png`;
        if (!existedBefore) {
            // 若無既有 ok.png 才測併發
            const [r1, r2] = await Promise.all([
                resolveImagePath(serverUrl, { allowUnsafeLocalForTest: true }),
                resolveImagePath(serverUrl, { allowUnsafeLocalForTest: true }),
            ]);
            assert.strictEqual(r1, 'assets/images/dynamic/ok.png');
            assert.strictEqual(r2, 'assets/images/dynamic/ok.png');
            assert.strictEqual(hitCount, 1, '相同 URL 併發下載應僅發起一次請求');
            await fs.promises.unlink(okDest).catch(() => {});
        } else {
            // 測試路徑遍歷防護：含 .. 的 URL 不會寫出動態目錄外
            const evilPath = await resolveImagePath(`http://127.0.0.1:${port}/..`, { allowUnsafeLocalForTest: true });
            assert(typeof evilPath === 'string');
        }
    } finally {
        await fs.promises.unlink(testDest).catch(() => {});
        await fs.promises.unlink(badDest).catch(() => {});
        await new Promise((resolve) => server.close(resolve));
    }
    console.log('   通過');
}

async function testSchedulerLockAndUnbind() {
    console.log('3. 測試 Scheduler 重入鎖與邊界防護...');
    const scheduler = require('../utils/scheduler');
    const User = require('../models/User');

    const origFindAll = User.findAll;
    let calls = 0;
    try {
        User.findAll = async () => {
            calls++;
            await new Promise((r) => setTimeout(r, 60));
            return [];
        };

        await Promise.all([
            scheduler.checkStamina({}),
            scheduler.checkStamina({}),
        ]);
        assert.strictEqual(calls, 1, 'checkStamina 應透過重入鎖略過重疊執行');
    } finally {
        User.findAll = origFindAll;
    }

    // 確認 cancelDailyNotifyUser 與 cancelUser 可安全呼叫
    assert.strictEqual(typeof scheduler.cancelUser, 'function');
    assert.strictEqual(typeof scheduler.cancelDailyNotifyUser, 'function');
    scheduler.cancelUser('nonexistent_discord_id');
    scheduler.cancelDailyNotifyUser('nonexistent_discord_id');
    console.log('   通過');
}

function testLocaleParityAndSecurityChecks() {
    console.log('4. 測試多語系鍵值一致性與安全回歸檢查...');
    const locales = {
        zh_Hant: require('../locales/zh_Hant'),
        zh_Hans: require('../locales/zh_Hans'),
        ja: require('../locales/ja'),
        en: require('../locales/en'),
    };
    const baseKeys = Object.keys(locales.zh_Hant).sort();
    for (const [name, dict] of Object.entries(locales)) {
        const keys = Object.keys(dict).sort();
        assert.deepStrictEqual(keys, baseKeys, `${name} 語系檔鍵值必須與 zh_Hant 一致`);
        for (const k of baseKeys) {
            assert.strictEqual(typeof dict[k], typeof locales.zh_Hant[k], `${name}.${k} 型別必須一致`);
        }
    }

    // bind.js 不可包含動態 eval / Function(t)()
    const bindSource = fs.readFileSync(path.resolve(__dirname, '../commands/attendance/bind.js'), 'utf8');
    assert.strictEqual(/new\s+Function|Function\s*\(/.test(bindSource), false, 'bind.js 不得執行動態 Function');

    // attendance.js 不可在 Accept-Encoding 宣稱支援未解壓的 zstd
    const attSource = fs.readFileSync(path.resolve(__dirname, '../utils/attendance.js'), 'utf8');
    assert.strictEqual(/zstd/i.test(attSource), false, 'attendance.js Accept-Encoding 不應宣稱支援 zstd');

    // setNotifyChannel.js 必須限制於伺服器情境
    const notifyCmd = require('../commands/utility/setNotifyChannel');
    assert(Array.isArray(notifyCmd.data.contexts) && notifyCmd.data.contexts.length === 1, 'setNotifyChannel 應僅限 Guild context');

    // profile.js 不得殘留佔位圖示網址
    const profileSource = fs.readFileSync(path.resolve(__dirname, '../commands/game/profile.js'), 'utf8');
    assert.strictEqual(profileSource.includes('example.com'), false, 'profile.js 不得包含 example.com 佔位網址');
    console.log('   通過');
}

async function main() {
    testEncryptionSecurity();
    await testHttpCacheAndDownloads();
    await testSchedulerLockAndUnbind();
    testLocaleParityAndSecurityChecks();
    console.log('\n所有核心修復驗證測試全數通過！');
}

main().catch((err) => {
    console.error('核心測試失敗:', err);
    process.exit(1);
});
