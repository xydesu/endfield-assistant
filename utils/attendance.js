const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { decrypt } = require('./encryption');
const { PLATFORM, VNAME, USER_AGENT } = require('./constants');
const { t, getSkLanguage } = require('./i18n');

const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

function sanitizeHeaders(headers) {
    if (!headers || typeof headers !== 'object') return headers;
    const out = { ...headers };
    for (const key of Object.keys(out)) {
        const lower = key.toLowerCase();
        if (lower === 'cred' || lower === 'cookie' || lower === 'authorization' || lower === 'set-cookie') {
            out[key] = '[REDACTED]';
        }
    }
    return out;
}

function decompressResponse(rawBuffer, encoding) {
    return new Promise((resolve, reject) => {
        const enc = (encoding || '').toLowerCase();
        const done = (err, buf) => {
            if (err) return reject(new Error(`Response decompression failed: ${err.message}`));
            resolve(buf.toString('utf8'));
        };

        if (enc === 'br') {
            zlib.brotliDecompress(rawBuffer, done);
        } else if (enc === 'gzip' || enc === 'deflate') {
            zlib.unzip(rawBuffer, done);
        } else if (!enc || enc === 'identity') {
            done(null, rawBuffer);
        } else {
            reject(new Error(`Unsupported Content-Encoding: ${enc}`));
        }
    });
}

function httpsJsonRequest(url, options, bodyStr = '', allowStatus403 = false) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: options.method || 'GET',
                headers: options.headers,
            },
            (res) => {
                const chunks = [];
                let totalBytes = 0;
                let aborted = false;

                res.on('data', (chunk) => {
                    if (aborted) return;
                    totalBytes += chunk.length;
                    if (totalBytes > MAX_RESPONSE_BYTES) {
                        aborted = true;
                        res.destroy();
                        reject(new Error(`Response exceeded maximum allowed size (${MAX_RESPONSE_BYTES} bytes)`));
                        return;
                    }
                    chunks.push(chunk);
                });

                res.on('end', async () => {
                    if (aborted) return;
                    const rawBuffer = Buffer.concat(chunks, totalBytes);
                    let body;
                    try {
                        body = await decompressResponse(rawBuffer, res.headers['content-encoding']);
                    } catch (err) {
                        console.error('[request] decompression error — err=%s', err.message);
                        return reject(err);
                    }

                    const isOk = (res.statusCode >= 200 && res.statusCode < 300) || (allowStatus403 && res.statusCode === 403);
                    if (isOk) {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            console.error(
                                '[request] %s %s parse error — reqHeaders=%j status=%d resHeaders=%j body=%s',
                                options.method || 'GET',
                                url.toString(),
                                sanitizeHeaders(options.headers),
                                res.statusCode,
                                sanitizeHeaders(res.headers),
                                body.substring(0, 500)
                            );
                            if (body.trim().startsWith('<') || res.statusCode === 403) {
                                reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                            } else {
                                resolve(body);
                            }
                        }
                    } else {
                        console.error(
                            '[request] %s %s — reqHeaders=%j status=%d resHeaders=%j body=%s',
                            options.method || 'GET',
                            url.toString(),
                            sanitizeHeaders(options.headers),
                            res.statusCode,
                            sanitizeHeaders(res.headers),
                            body.substring(0, 500)
                        );
                        reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                    }
                });
            }
        );

        const timer = setTimeout(() => {
            req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
        }, REQUEST_TIMEOUT_MS);

        req.on('error', (e) => {
            clearTimeout(timer);
            reject(e);
        });
        req.on('close', () => clearTimeout(timer));

        if (options.method === 'POST' && bodyStr) {
            req.write(bodyStr);
        }
        req.end();
    });
}

function computeSign(path, body, timestamp, token, platform = PLATFORM, vName = VNAME) {
    // headerObj key names must match the server's expected sign format exactly
    const headerObj = { platform: platform, timestamp: timestamp, dId: '', vName: vName };
    const headersJson = JSON.stringify(headerObj);
    const signString = path + body + timestamp + headersJson;
    const hmacHex = crypto.createHmac('sha256', token).update(signString, 'utf8').digest('hex');
    return crypto.createHash('md5').update(hmacHex, 'utf8').digest('hex');
}

async function refreshSignTokenWithCred(rawCred, domain) {
    const isCn = domain === 'skland.com';
    const url = new URL('/web/v1/auth/refresh', `https://zonai.${domain}`);
    const headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'cred': rawCred,
        'platform': isCn ? '' : PLATFORM,
        'vName': isCn ? '' : VNAME,
        'Origin': `https://game.${domain}`,
        'Referer': `https://game.${domain}/`,
    };
    const json = await httpsJsonRequest(url, { method: 'GET', headers }, '', false);
    if (json && json.code === 0 && json.data && json.data.token) {
        return json.data.token;
    }
    throw new Error(`Refresh failed (Code: ${json?.code}, Msg: ${json?.message})`);
}

async function refreshSignToken(user) {
    const isCn = user.serverId === '1' || user.serverId === '57';
    const domain = isCn ? 'skland.com' : 'skport.com';
    return refreshSignTokenWithCred(decrypt(user.cred), domain);
}

async function request(method, endpoint, user, data = null, signToken = '') {
    const skLang = getSkLanguage(user.language || 'zh_Hant');
    // 官服 (serverId 1 或 57) 使用 skland.com，其餘國際服使用 skport.com
    const isCnServer = user.serverId === '1' || user.serverId === '57';
    const domain = isCnServer ? 'skland.com' : 'skport.com';
    const url = endpoint.startsWith('http')
        ? new URL(endpoint)
        : new URL(endpoint, `https://zonai.${domain}`);

    if (method === 'GET' && data) {
        Object.keys(data).forEach(key => url.searchParams.append(key, data[key]));
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = (method === 'POST' && data) ? JSON.stringify(data) : '';
    // For GET requests the sign uses the query string (without leading '?');
    // for POST requests it uses the JSON body — matching the website's sign algorithm.
    const signBody = (method === 'GET') ? (url.search ? url.search.slice(1) : '') : bodyStr;

    const signPlat = isCnServer ? '' : PLATFORM;
    const signVName = isCnServer ? '' : VNAME;

    const headers = {
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': `https://game.${domain}/`,
        'Content-Type': 'application/json',
        'sk-language': skLang,
        'sk-game-role': `${PLATFORM}_${user.uid}_${user.serverId}`,
        'cred': decrypt(user.cred),
        'platform': isCnServer ? '' : PLATFORM,
        'vName': isCnServer ? '' : VNAME,
        'timestamp': timestamp,
        'sign': computeSign(url.pathname, signBody, timestamp, signToken, signPlat, signVName),
        'Origin': `https://game.${domain}`,
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
    };

    return httpsJsonRequest(url, { method, headers }, bodyStr, true);
}

function formatRequestError(error) {
    let errorMsg = error?.message;
    if (!errorMsg && error?.body) {
        errorMsg = `Status ${error.statusCode}: ${error.body}`;
    } else if (!errorMsg) {
        errorMsg = JSON.stringify(error);
    }
    return String(errorMsg);
}

async function signIn(user) {
    const lang = user.language || 'zh_Hant';
    try {
        const token = await refreshSignToken(user);
        const postUrl = `/web/v1/game/endfield/attendance`;
        const result = await request('POST', postUrl, user, null, token);

        if (result.code === 0) {
            const today = new Date().toISOString().split('T')[0];
            await user.update({ lastSignDate: today });

            let awards = [];
            let tomorrowAwards = [];
            if (result.data) {
                if (result.data.awardIds && result.data.resourceInfoMap) {
                    awards = result.data.awardIds.map(award => {
                        const resource = result.data.resourceInfoMap[award.id];
                        return resource
                            ? { name: resource.name, count: resource.count, icon: resource.icon }
                            : { name: `Item(ID:${award.id})`, count: 1, icon: null };
                    });
                }
                if (result.data.tomorrowAwardIds && result.data.resourceInfoMap) {
                    tomorrowAwards = result.data.tomorrowAwardIds.map(award => {
                        const resource = result.data.resourceInfoMap[award.id];
                        return resource
                            ? { name: resource.name, count: resource.count, icon: resource.icon }
                            : { name: `Item(ID:${award.id})`, count: 1, icon: null };
                    });
                }
            }
            return { success: true, message: t(lang, 'attendance_success'), awards, tomorrowAwards };

        } else if (result.code === 10001) {
            const today = new Date().toISOString().split('T')[0];
            await user.update({ lastSignDate: today });
            return { success: true, message: t(lang, 'attendance_already') };
        } else {
            const resultStr = JSON.stringify(result).substring(0, 1000);
            return { success: false, message: t(lang, 'attendance_fail')(resultStr) };
        }

    } catch (error) {
        const errorMsg = formatRequestError(error);
        console.error(`[signIn] uid=${user.uid}`, errorMsg);
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
        const token = await refreshSignToken(user);
        const result = await request('GET', '/api/v1/game/endfield/card/detail', user,
            { roleId: user.uid, serverId: user.serverId }, token);

        if (result.code === 0 && result.data && result.data.detail) {
            return { success: true, detail: result.data.detail };
        } else {
            return { success: false, message: t(lang, 'attendance_api_error')(result.message ?? JSON.stringify(result).substring(0, 200)) };
        }
    } catch (error) {
        const errorMsg = formatRequestError(error);
        console.error(`[getCardDetail] uid=${user.uid}`, errorMsg);
        return { success: false, message: t(lang, 'attendance_error')(errorMsg.substring(0, 500)) };
    }
}

async function getIndieHardDetail(user) {
    const lang = user.language || 'zh_Hant';
    try {
        const token = await refreshSignToken(user);
        const result = await request('GET', '/api/v1/game/endfield/card/indie-hard', user,
            { roleId: user.uid, serverId: user.serverId }, token);

        if (result.code === 0 && result.data && result.data.indieHard) {
            return { success: true, indieHard: result.data.indieHard };
        } else {
            return { success: false, message: t(lang, 'attendance_api_error')(result.message ?? JSON.stringify(result).substring(0, 200)) };
        }
    } catch (error) {
        const errorMsg = formatRequestError(error);
        console.error(`[getIndieHardDetail] uid=${user.uid}`, errorMsg);
        return { success: false, message: t(lang, 'attendance_error')(errorMsg.substring(0, 500)) };
    }
}

async function fetchRolesFromPlatform(rawCred, domain) {
    const isCn = domain === 'skland.com';
    const token = await refreshSignTokenWithCred(rawCred, domain);

    const apiPath = '/api/v1/game/player/binding';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signPlat = isCn ? '' : PLATFORM;
    const signVName = isCn ? '' : VNAME;
    const sign = computeSign(apiPath, '', timestamp, token, signPlat, signVName);

    const url = new URL(apiPath, `https://zonai.${domain}`);
    const headers = {
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/json',
        'sk-language': 'zh_Hant',
        'cred': rawCred,
        'platform': isCn ? '' : PLATFORM,
        'vName': isCn ? '' : VNAME,
        'timestamp': timestamp,
        'sign': sign,
        'Origin': `https://game.${domain}`,
        'Referer': `https://game.${domain}/`,
    };

    const json = await httpsJsonRequest(url, { method: 'GET', headers }, '', false);
    if (json && json.code === 0 && json.data && Array.isArray(json.data.list)) {
        const roles = [];
        json.data.list.forEach(game => {
            if (game?.appCode !== 'endfield' || !Array.isArray(game.bindingList)) return;
            game.bindingList.forEach(binding => {
                (binding?.roles || []).forEach(role => {
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
        return roles;
    }
    throw new Error(`Binding API failed (Code: ${json?.code}, Msg: ${json?.message})`);
}

async function getBindingList(rawCred) {
    const domains = ['skport.com', 'skland.com'];
    const results = await Promise.allSettled(domains.map(domain => fetchRolesFromPlatform(rawCred, domain)));

    const allRoles = [];
    const errors = [];
    results.forEach((res, idx) => {
        if (res.status === 'fulfilled') {
            allRoles.push(...res.value);
        } else {
            errors.push(`${domains[idx]}: ${res.reason.message || res.reason}`);
        }
    });

    if (allRoles.length === 0) {
        throw new Error(`Failed to fetch binding list: ${errors.join(' | ')}`);
    }

    return allRoles;
}

async function getCrisisSummary(user, contractId) {
    const lang = user.language || 'zh_Hant';
    try {
        const token = await refreshSignToken(user);
        const result = await request('GET', '/api/v1/game/endfield/card/crisis-contract', user,
            { roleId: user.uid, serverId: user.serverId, userId: '', contractId: contractId }, token);

        if (result.code === 0 && result.data) {
            return { success: true, data: result.data };
        } else {
            return { success: false, message: t(lang, 'attendance_api_error')(result.message ?? JSON.stringify(result).substring(0, 200)) };
        }
    } catch (error) {
        const errorMsg = formatRequestError(error);
        console.error(`[getCrisisSummary] uid=${user.uid}`, errorMsg);
        return { success: false, message: t(lang, 'attendance_error')(errorMsg.substring(0, 500)) };
    }
}

async function getCrisisDetail(user, recordId, contractId) {
    const lang = user.language || 'zh_Hant';
    try {
        const token = await refreshSignToken(user);
        const result = await request('GET', '/api/v1/game/endfield/card/crisis-contract/record', user,
            { roleId: user.uid, serverId: user.serverId, userId: '', contractId: contractId, recordId: recordId }, token);

        if (result.code === 0 && result.data) {
            return { success: true, data: result.data };
        } else {
            return { success: false, message: t(lang, 'attendance_api_error')(result.message ?? JSON.stringify(result).substring(0, 200)) };
        }
    } catch (error) {
        const errorMsg = formatRequestError(error);
        console.error(`[getCrisisDetail] uid=${user.uid}`, errorMsg);
        return { success: false, message: t(lang, 'attendance_error')(errorMsg.substring(0, 500)) };
    }
}

module.exports = { signIn, buildAttendanceEmbed, getCardDetail, getIndieHardDetail, getBindingList, getCrisisSummary, getCrisisDetail };
