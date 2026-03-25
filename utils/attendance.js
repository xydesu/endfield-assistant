const https = require('https');
const crypto = require('crypto');
const User = require('../models/User');
const { decrypt } = require('./encryption');
const { PLATFORM, VNAME, USER_AGENT } = require('./constants');

const REQUEST_TIMEOUT_MS = 15000;

function computeSign(path, body, timestamp, token) {
    // headerObj key names must match the server's expected sign format exactly
    const headerObj = { platform: PLATFORM, timestamp: timestamp, dId: '', vName: VNAME };
    const headersJson = JSON.stringify(headerObj);
    const signString = path + body + timestamp + headersJson;
    const hmacHex = crypto.createHmac('sha256', token).update(signString, 'utf8').digest('hex');
    return crypto.createHash('md5').update(hmacHex, 'utf8').digest('hex');
}

async function refreshSignToken(user) {
    return new Promise((resolve, reject) => {
        const url = new URL('/web/v1/auth/refresh', 'https://zonai.skport.com');
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/plain, */*',
                'cred': decrypt(user.cred),
                'platform': PLATFORM,
                'vName': VNAME,
                'Origin': 'https://game.skport.com',
                'Referer': 'https://game.skport.com/'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (json.code === 0 && json.data && json.data.token) {
                        resolve(json.data.token);
                    } else {
                        reject(new Error(`Refresh failed (Code: ${json.code}, Msg: ${json.message})`));
                    }
                } catch (e) {
                    reject(new Error(`Refresh response parse error: ${e.message}`));
                }
            });
        });

        const timer = setTimeout(() => {
            req.destroy(new Error(`Refresh request timed out after ${REQUEST_TIMEOUT_MS}ms`));
        }, REQUEST_TIMEOUT_MS);

        req.on('error', (e) => { clearTimeout(timer); reject(e); });
        req.on('close', () => clearTimeout(timer));
        req.end();
    });
}

async function request(method, endpoint, user, data = null, signToken = '') {
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

        const headers = {
            'User-Agent': USER_AGENT,
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
            // SKPort API validates signature against the full path including query parameters
            'sign': computeSign(url.pathname + url.search, bodyStr, timestamp, signToken),
            'Origin': 'https://game.skport.com',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site'
        };

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
        let token = '';
        try {
            token = await refreshSignToken(user);
        } catch (e) {
            console.error(`[${user.uid}] Token refresh failed, proceeding with empty token: ${e.message}`);
            // Proceed with empty token; sign will be computed with empty string key
        }

        const postUrl = `/web/v1/game/endfield/attendance`;
        const result = await request('POST', postUrl, user, null, token);

        if (result.code === 0) {
            // Success
            const today = new Date().toISOString().split('T')[0];
            await user.update({ lastSignDate: today });

            // Parse structured reward data
            let awards = [];
            let tomorrowAwards = [];
            if (result.data) {
                if (result.data.awardIds && result.data.resourceInfoMap) {
                    awards = result.data.awardIds.map(award => {
                        const resource = result.data.resourceInfoMap[award.id];
                        // count falls back to 1 when the resource is not present in the map
                        return resource
                            ? { name: resource.name, count: resource.count, icon: resource.icon }
                            : { name: `Item(ID:${award.id})`, count: 1, icon: null };
                    });
                }
                if (result.data.tomorrowAwardIds && result.data.resourceInfoMap) {
                    tomorrowAwards = result.data.tomorrowAwardIds.map(award => {
                        const resource = result.data.resourceInfoMap[award.id];
                        // count falls back to 1 when the resource is not present in the map
                        return resource
                            ? { name: resource.name, count: resource.count, icon: resource.icon }
                            : { name: `Item(ID:${award.id})`, count: 1, icon: null };
                    });
                }
            }
            return { success: true, message: '簽到成功！', awards, tomorrowAwards };

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

function buildAttendanceEmbed(EmbedBuilder, EMBED_COLOR, title, result, discordUser = null) {
    const fullTitle = discordUser ? `${title} | @${discordUser.username}` : title;
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(fullTitle)
        .setTimestamp();

    if (result.awards && result.awards.length > 0) {
        const awardsText = result.awards.map(a => `• ${a.name} x${a.count}`).join('\n');
        embed.addFields({ name: '🎁 今日獎勵', value: awardsText, inline: false });
        const firstIcon = result.awards.find(a => a.icon)?.icon;
        if (firstIcon) embed.setThumbnail(firstIcon);
    } else {
        embed.setDescription(result.message ?? '簽到成功！');
    }

    if (result.tomorrowAwards && result.tomorrowAwards.length > 0) {
        const tomorrowText = result.tomorrowAwards.map(a => `• ${a.name} x${a.count}`).join('\n');
        embed.addFields({ name: '📅 明日獎勵', value: tomorrowText, inline: false });
    }

    return embed;
}

async function getCardDetail(user) {
    try {
        let token = '';
        try {
            token = await refreshSignToken(user);
        } catch (e) {
            console.error(`[${user.uid}] Token refresh failed for card detail: ${e.message}`);
        }

        const url = new URL('/api/v1/game/endfield/card/detail', 'https://zonai.skport.com');
        url.searchParams.set('roleId', user.uid);
        url.searchParams.set('serverId', user.serverId);

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const sign = computeSign(url.pathname + url.search, /* body= */ '', timestamp, token);

        const result = await new Promise((resolve, reject) => {
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': '*/*',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Referer': 'https://game.skport.com/',
                    'Content-Type': 'application/json',
                    'sk-language': 'zh_Hant',
                    'cred': decrypt(user.cred),
                    'platform': PLATFORM,
                    'vName': VNAME,
                    'timestamp': timestamp,
                    'sign': sign,
                    'Origin': 'https://game.skport.com',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site',
                },
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            reject(new Error(`Parse error: ${e.message}`));
                        }
                    } else {
                        reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                    }
                });
            });

            const timer = setTimeout(() => {
                req.destroy(new Error(`Card detail request timed out after ${REQUEST_TIMEOUT_MS}ms`));
            }, REQUEST_TIMEOUT_MS);

            req.on('error', (e) => { clearTimeout(timer); reject(e); });
            req.on('close', () => clearTimeout(timer));
            req.end();
        });

        if (result.code === 0 && result.data && result.data.detail) {
            return { success: true, detail: result.data.detail };
        } else {
            return { success: false, message: `API 回傳錯誤: ${result.message ?? JSON.stringify(result).substring(0, 200)}` };
        }
    } catch (error) {
        let errorMsg = error.message;
        if (!errorMsg && error.body) {
            errorMsg = `Status ${error.statusCode}: ${error.body}`;
        } else if (!errorMsg) {
            errorMsg = JSON.stringify(error);
        }
        return { success: false, message: `發生錯誤: ${errorMsg.substring(0, 500)}` };
    }
}

module.exports = { signIn, buildAttendanceEmbed, getCardDetail };
