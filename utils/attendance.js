const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const User = require('../models/User');
const { decrypt } = require('./encryption');
const { PLATFORM, VNAME, USER_AGENT } = require('./constants');
const { t, getSkLanguage } = require('./i18n');

const REQUEST_TIMEOUT_MS = 15000;

function sanitizeHeaders(headers) {
    if (!headers || typeof headers !== 'object') return headers;
    const out = { ...headers };
    if ('cred' in out) out.cred = '[REDACTED]';
    return out;
}

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
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const rawBuffer = Buffer.concat(chunks);
                const encoding = (res.headers['content-encoding'] || '').toLowerCase();
                const decompress = encoding === 'br'
                    ? (buf, cb) => zlib.brotliDecompress(buf, cb)
                    : (encoding === 'gzip' || encoding === 'deflate')
                        ? (buf, cb) => zlib.unzip(buf, cb)
                        : (buf, cb) => cb(null, buf);
                decompress(rawBuffer, (err, decompressed) => {
                    if (err) {
                        reject(new Error(`Refresh response decompression failed: ${err.message}`));
                        return;
                    }
                    const body = decompressed.toString('utf8');
                    try {
                        const json = JSON.parse(body);
                        if (json.code === 0 && json.data && json.data.token) {
                            resolve(json.data.token);
                        } else {
                            console.error('[refreshSignToken] uid=%s reqHeaders=%j status=%d resHeaders=%j body=%s',
                                user.uid, sanitizeHeaders(options.headers), res.statusCode, res.headers, body.substring(0, 1000));
                            reject(new Error(`Refresh failed (Code: ${json.code}, Msg: ${json.message})`));
                        }
                    } catch (e) {
                        console.error('[refreshSignToken] uid=%s reqHeaders=%j status=%d resHeaders=%j body=%s',
                            user.uid, sanitizeHeaders(options.headers), res.statusCode, res.headers, body.substring(0, 1000));
                        reject(new Error(`Refresh response parse error: ${e.message}`));
                    }
                });
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
    const skLang = getSkLanguage(user.language || 'zh_Hant');
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
        // For GET requests the sign uses the query string (without leading '?');
        // for POST requests it uses the JSON body — matching the website's sign algorithm.
        const signBody = (method === 'GET') ? (url.search ? url.search.slice(1) : '') : bodyStr;

        const headers = {
            'User-Agent': USER_AGENT,
            'Accept': '*/*',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Referer': 'https://game.skport.com/',
            'Content-Type': 'application/json',
            'sk-language': skLang,
            'sk-game-role': `3_${user.uid}_${user.serverId}`,
            'cred': decrypt(user.cred),
            'platform': PLATFORM,
            'vName': VNAME,
            'timestamp': timestamp,
            'sign': computeSign(url.pathname, signBody, timestamp, signToken),
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
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const rawBuffer = Buffer.concat(chunks);
                const encoding = (res.headers['content-encoding'] || '').toLowerCase();
                const decompress = encoding === 'br'
                    ? (buf, cb) => zlib.brotliDecompress(buf, cb)
                    : (encoding === 'gzip' || encoding === 'deflate')
                        ? (buf, cb) => zlib.unzip(buf, cb)
                        : (buf, cb) => cb(null, buf);
                decompress(rawBuffer, (err, decompressed) => {
                    if (err) {
                        console.error('[request] decompression error — encoding=%s err=%s', encoding, err.message);
                        return reject(new Error(`Response decompression failed: ${err.message}`));
                    }
                    const body = decompressed.toString('utf8');
                    // The API returns HTTP 403 with a JSON body for "Already Signed In" (code 10001)
                    if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 403) {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            console.error('[request] %s %s parse error — reqHeaders=%j status=%d resHeaders=%j body=%s',
                                method, url.toString(), sanitizeHeaders(headers), res.statusCode, res.headers, body.substring(0, 1000));
                            if (body.trim().startsWith('<')) {
                                reject({ statusCode: res.statusCode, headers: res.headers, body: body.substring(0, 500) });
                            } else {
                                if (res.statusCode === 403) reject({ statusCode: res.statusCode, headers: res.headers, body: body.substring(0, 500) });
                                else resolve(body);
                            }
                        }
                    } else {
                        console.error('[request] %s %s — reqHeaders=%j status=%d resHeaders=%j body=%s',
                            method, url.toString(), sanitizeHeaders(headers), res.statusCode, res.headers, body.substring(0, 1000));
                        reject({ statusCode: res.statusCode, headers: res.headers, body: body.substring(0, 500) });
                    }
                });
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
    const lang = user.language || 'zh_Hant';
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
            return { success: true, message: t(lang, 'attendance_success'), awards, tomorrowAwards };

        } else if (result.code === 10001) {
            // Already signed in
            const today = new Date().toISOString().split('T')[0];
            await user.update({ lastSignDate: today });
            return { success: true, message: t(lang, 'attendance_already') };
        } else {
            const resultStr = JSON.stringify(result).substring(0, 1000);
            return { success: false, message: t(lang, 'attendance_fail')(resultStr) };
        }

    } catch (error) {
        let errorMsg = error.message;
        if (!errorMsg && error.body) {
            errorMsg = `Status ${error.statusCode}: ${error.body}`;
        } else if (!errorMsg) {
            errorMsg = JSON.stringify(error);
        }
        console.error(`[signIn] uid=${user.uid}`, error);
        return { success: false, message: t(lang, 'attendance_error')(errorMsg.substring(0, 1000)) };
    }
}

function buildAttendanceEmbed(EmbedBuilder, EMBED_COLOR, title, result, discordUser = null, lang = 'zh_Hant') {
    const fullTitle = discordUser ? `${title} | @${discordUser.username}` : title;
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(fullTitle)
        .setTimestamp();

    if (result.awards && result.awards.length > 0) {
        const awardsText = result.awards.map(a => `• ${a.name} x${a.count}`).join('\n');
        embed.addFields({ name: t(lang, 'attendance_today'), value: awardsText, inline: false });
        const firstIcon = result.awards.find(a => a.icon)?.icon;
        if (firstIcon) embed.setThumbnail(firstIcon);
    } else {
        embed.setDescription(result.message ?? t(lang, 'attendance_success'));
    }

    if (result.tomorrowAwards && result.tomorrowAwards.length > 0) {
        const tomorrowText = result.tomorrowAwards.map(a => `• ${a.name} x${a.count}`).join('\n');
        embed.addFields({ name: t(lang, 'attendance_tomorrow'), value: tomorrowText, inline: false });
    }

    return embed;
}

async function getCardDetail(user) {
    const lang = user.language || 'zh_Hant';
    try {
        let token = '';
        try {
            token = await refreshSignToken(user);
        } catch (e) {
            console.error(`[${user.uid}] Token refresh failed for card detail: ${e.message}`);
        }

        const result = await request('GET', '/api/v1/game/endfield/card/detail', user,
            { roleId: user.uid, serverId: user.serverId }, token);

        if (result.code === 0 && result.data && result.data.detail) {
            return { success: true, detail: result.data.detail };
        } else {
            return { success: false, message: t(lang, 'attendance_api_error')(result.message ?? JSON.stringify(result).substring(0, 200)) };
        }
    } catch (error) {
        let errorMsg = error.message;
        if (!errorMsg && error.body) {
            errorMsg = `Status ${error.statusCode}: ${error.body}`;
        } else if (!errorMsg) {
            errorMsg = JSON.stringify(error);
        }
        console.error(`[getCardDetail] uid=${user.uid}`, error);
        return { success: false, message: t(lang, 'attendance_error')(errorMsg.substring(0, 500)) };
    }
}

async function getBindingList(rawCred) {
    // Step 1: Refresh token using raw (unencrypted) cred
    const token = await new Promise((resolve, reject) => {
        const url = new URL('/web/v1/auth/refresh', 'https://zonai.skport.com');
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'application/json, text/plain, */*',
                'cred': rawCred,
                'platform': PLATFORM,
                'vName': VNAME,
                'Origin': 'https://game.skport.com',
                'Referer': 'https://game.skport.com/'
            }
        };
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const rawBuffer = Buffer.concat(chunks);
                const encoding = (res.headers['content-encoding'] || '').toLowerCase();
                const decompress = encoding === 'br'
                    ? (buf, cb) => zlib.brotliDecompress(buf, cb)
                    : (encoding === 'gzip' || encoding === 'deflate')
                        ? (buf, cb) => zlib.unzip(buf, cb)
                        : (buf, cb) => cb(null, buf);
                decompress(rawBuffer, (err, buf) => {
                    if (err) return reject(new Error(`Decompression failed: ${err.message}`));
                    try {
                        const json = JSON.parse(buf.toString('utf8'));
                        if (json.code === 0 && json.data && json.data.token) {
                            resolve(json.data.token);
                        } else {
                            reject(new Error(`Token refresh failed (Code: ${json.code}, Msg: ${json.message})`));
                        }
                    } catch (e) {
                        reject(new Error(`Parse error: ${e.message}`));
                    }
                });
            });
        });
        const timer = setTimeout(() => req.destroy(new Error('Request timed out')), REQUEST_TIMEOUT_MS);
        req.on('error', e => { clearTimeout(timer); reject(e); });
        req.on('close', () => clearTimeout(timer));
        req.end();
    });

    // Step 2: Call binding endpoint
    const path = '/api/v1/game/player/binding';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sign = computeSign(path, '', timestamp, token);

    return new Promise((resolve, reject) => {
        const url = new URL(path, 'https://zonai.skport.com');
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': '*/*',
                'Content-Type': 'application/json',
                'sk-language': 'zh_Hant',
                'cred': rawCred,
                'platform': PLATFORM,
                'vName': VNAME,
                'timestamp': timestamp,
                'sign': sign,
                'Origin': 'https://game.skport.com',
                'Referer': 'https://game.skport.com/'
            }
        };
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const rawBuffer = Buffer.concat(chunks);
                const encoding = (res.headers['content-encoding'] || '').toLowerCase();
                const decompress = encoding === 'br'
                    ? (buf, cb) => zlib.brotliDecompress(buf, cb)
                    : (encoding === 'gzip' || encoding === 'deflate')
                        ? (buf, cb) => zlib.unzip(buf, cb)
                        : (buf, cb) => cb(null, buf);
                decompress(rawBuffer, (err, buf) => {
                    if (err) return reject(new Error(`Decompression failed: ${err.message}`));
                    try {
                        const json = JSON.parse(buf.toString('utf8'));
                        if (json.code === 0 && json.data && json.data.list) {
                            const roles = [];
                            json.data.list.forEach(game => {
                                game.bindingList.forEach(binding => {
                                    (binding.roles || []).forEach(role => {
                                        roles.push({
                                            serverName: role.serverName,
                                            nickname: role.nickname,
                                            level: role.level,
                                            roleId: String(role.roleId),
                                            serverId: role.serverId != null ? String(role.serverId) : null,
                                        });
                                    });
                                });
                            });
                            resolve(roles);
                        } else {
                            reject(new Error(`Binding API failed (Code: ${json.code}, Msg: ${json.message})`));
                        }
                    } catch (e) {
                        reject(new Error(`Parse error: ${e.message}`));
                    }
                });
            });
        });
        const timer = setTimeout(() => req.destroy(new Error('Request timed out')), REQUEST_TIMEOUT_MS);
        req.on('error', e => { clearTimeout(timer); reject(e); });
        req.on('close', () => clearTimeout(timer));
        req.end();
    });
}

module.exports = { signIn, buildAttendanceEmbed, getCardDetail, getBindingList };
