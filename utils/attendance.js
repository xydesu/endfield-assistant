const https = require('https');
const User = require('../models/User');
const { decrypt } = require('./encryption');

async function request(method, endpoint, user, data = null) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            if (endpoint.startsWith('http')) {
                url = new URL(endpoint);
            } else {
                // Ensure baseUrl doesn't end with slash if endpoint starts with one, or handle neatly
                let base = 'https://zonai.skport.com';


                url = new URL(endpoint, base);
            }
        } catch (e) {
            return reject(e);
        }

        if (method === 'GET' && data) {
            Object.keys(data).forEach(key => url.searchParams.append(key, data[key]));
        }

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
            'Accept': '*/*',
            'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Referer': 'https://game.skport.com/',
            'Content-Type': 'application/json',
            'sk-language': 'zh_Hant', // User example uses 'en', previously 'zh-TW', sticking to example
            'sk-game-role': `3_${user.uid}_${user.serverId}`,
            'cred': decrypt(user.cred),
            'platform': '3', // User example uses variable 'platform', assuming 3
            'vName': '1.0.0', // User example uses variable 'vName', assuming 1.0.0
            'timestamp': Math.floor(Date.now() / 1000).toString(),
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

                // Accept 403 because the API uses it for "Already Signed In" (code 10001)
                if ((res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 403) {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        // If response is not JSON, check for HTML
                        if (body.trim().startsWith('<')) {
                            // If it was 403 and HTML, it really is a forbidden error, not the JSON logic we expect
                            if (res.statusCode === 403) {
                                reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                            } else {
                                resolve({ code: -1, msg: 'Server returned HTML (likely error page)', raw: body.substring(0, 500) });
                            }
                        } else {
                            // If plain text (not JSON, not HTML), generic resolve if valid status
                            if (res.statusCode === 403) reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                            else resolve(body);
                        }
                    }
                } else {
                    reject({ statusCode: res.statusCode, body: body.substring(0, 500) });
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (method === 'POST' && data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function signIn(user) {
    try {
        const gameId = "3";
        // const gameIdInt = parseInt(gameId, 10); // Not used if payload is removed

        // Sign in directly (POST) as per example logic
        // Important: User example UrlFetchApp.fetch(attendanceUrl, options) implies NO BODY if options has no payload.
        // We will append gameId to query string as per API analysis, even if example didn't explicit show URL.
        const postUrl = `/web/v1/game/endfield/attendance?gameId=${gameId}`;

        // Pass null as data to avoid sending JSON body
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
                    return resource ? `${resource.name} x${resource.count}` : `Item(ID:${award.id}) x${award.count}`;
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
