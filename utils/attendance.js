const https = require('https');
const crypto = require('crypto');
const User = require('../models/User');
const { decrypt } = require('./encryption');
const { PLATFORM, VNAME } = require('./constants');

const REQUEST_TIMEOUT_MS = 15000;

function computeSign(path, body, timestamp, signToken) {
    // headerObj key names must match the server's expected sign format exactly
    const headerObj = { platform: PLATFORM, timestamp: timestamp, dId: '', vName: VNAME };
    const headersJson = JSON.stringify(headerObj);
    const signString = path + body + timestamp + headersJson;
    const hmacHex = crypto.createHmac('sha256', signToken).update(signString, 'utf8').digest('hex');
    return crypto.createHash('md5').update(hmacHex, 'utf8').digest('hex');
}

async function request(method, endpoint, user, data = null) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            if (endpoint.startsWith('http')) {
                url = new URL(endpoint);
            } else {
                url = new URL(endpoint, 'https://zonai.skport.com');
            }
        } catch (e) {
            return reject(e);
        }

        if (method === 'GET' && data) {
            Object.keys(data).forEach(key => url.searchParams.append(key, data[key]));
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const bodyStr = (method === 'POST' && data) ? JSON.stringify(data) : '';
        const decryptedSignToken = user.signToken ? decrypt(user.signToken) : null;

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0',
            'Accept': '*/*',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Referer': 'https://game.skport.com/',
            'Content-Type': 'application/json',
            'sk-language': 'zh_Hant',
            'sk-game-role': `3_${user.uid}_${user.serverId}`,
            'cred': decrypt(user.cred),
            'platform': PLATFORM,
            'vName': VNAME,
            'timestamp': timestamp,
            'Origin': 'https://game.skport.com',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site'
        };

        if (decryptedSignToken) {
            headers['sign'] = computeSign(url.pathname, bodyStr, timestamp, decryptedSignToken);
        }

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: headers
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                // The API returns HTTP 403 with a JSON body for "Already Signed In" (code 10001)
                if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 403) {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        if (body.trim().startsWith('<')) {
                            reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                        } else {
                            if (res.statusCode === 403) reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                            else resolve(body);
                        }
                    }
                } else {
                    reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                }
            });
        });

        const timer = setTimeout(() => {
            req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
        }, REQUEST_TIMEOUT_MS);

        req.on('error', (e) => {
            clearTimeout(timer);
            reject(e);
        });

        req.on('close', () => clearTimeout(timer));

        if (method === 'POST' && data) {
            req.write(bodyStr);
        }
        req.end();
    });
}

async function signIn(user) {
    try {
        const postUrl = `/web/v1/game/endfield/attendance`;
        const result = await request('POST', postUrl, user, null);

        if (result.code === 0) {
            // Success
            const today = new Date().toISOString().split('T')[0];
            await user.update({ lastSignDate: today });

            // Format rewards
            let awardsText = '無';
            if (result.data && result.data.awardIds) {
                awardsText = result.data.awardIds.map(award => {
                    const resource = result.data.resourceInfoMap ? result.data.resourceInfoMap[award.id] : null;
                    return resource ? `${resource.name} x${resource.count}` : `Item(ID:${award.id})`;
                }).join(', ');
            }
            return { success: true, message: '簽到成功！', data: awardsText };

        } else if (result.code === 10001) {
            // Already signed in
            const today = new Date().toISOString().split('T')[0];
            await user.update({ lastSignDate: today });
            return { success: true, message: '今日已簽到 (重複執行)' };
        } else {
            const resultStr = JSON.stringify(result).substring(0, 1000);
            return { success: false, message: `簽到失敗: ${resultStr}` };
        }

    } catch (error) {
        let errorMsg = error.message;
        if (!errorMsg && error.body) {
            errorMsg = `Status ${error.statusCode}: ${error.body}`;
        } else if (!errorMsg) {
            errorMsg = JSON.stringify(error);
        }
        return { success: false, message: `發生錯誤: ${errorMsg.substring(0, 1000)}` };
    }
}

module.exports = { signIn };
