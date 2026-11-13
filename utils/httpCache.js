const http = require('http');
const https = require('https');
const fs = require('fs');
const dns = require('dns');
const net = require('net');
const { loadImage } = require('canvas');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_CACHE_ENTRIES = 300;
const MAX_REDIRECTS = 3;

function isPrivateOrReservedIpv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 127) return true; // 127.0.0.0/8 Loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / Metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
    if (a === 192 && b === 0 && parts[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
    if (a >= 224) return true; // Multicast & Reserved (224.0.0.0+)
    return false;
}

function isPrivateOrReservedIp(ip) {
    if (!ip || typeof ip !== 'string') return true;
    const cleaned = ip.split('%')[0].toLowerCase();
    const ipType = net.isIP(cleaned);
    if (ipType === 4) {
        return isPrivateOrReservedIpv4(cleaned);
    }
    if (ipType === 6) {
        if (cleaned === '::' || cleaned === '::1') return true;
        if (cleaned.startsWith('::ffff:')) {
            const v4Part = cleaned.slice('::ffff:'.length);
            if (net.isIP(v4Part) === 4) {
                return isPrivateOrReservedIpv4(v4Part);
            }
        }
        // fc00::/7 (Unique local), fe80::/10 (Link-local), ff00::/8 (Multicast)
        const firstHextet = parseInt(cleaned.split(':')[0] || '0', 16);
        if ((firstHextet & 0xfe00) === 0xfc00) return true;
        if ((firstHextet & 0xffc0) === 0xfe80) return true;
        if ((firstHextet & 0xff00) === 0xff00) return true;
        return false;
    }
    return true;
}

function matchesAllowedHostSuffix(hostname, allowedHostSuffixes) {
    if (!Array.isArray(allowedHostSuffixes) || allowedHostSuffixes.length === 0) return true;
    const host = hostname.toLowerCase();
    return allowedHostSuffixes.some((suffix) => {
        const norm = suffix.toLowerCase().replace(/^\./, '');
        return host === norm || host.endsWith(`.${norm}`);
    });
}

async function resolveAndValidateRemoteUrl(targetUrl, options = {}) {
    const {
        allowUnsafeLocalForTest = false,
        allowedHostSuffixes = null,
    } = options;

    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch {
        throw new Error(`Invalid URL: ${targetUrl}`);
    }

    if (parsedUrl.username || parsedUrl.password) {
        throw new Error('URL userinfo is not allowed');
    }

    if (!allowUnsafeLocalForTest) {
        if (parsedUrl.protocol !== 'https:') {
            throw new Error(`Unsupported or insecure protocol: ${parsedUrl.protocol}`);
        }
    } else if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
    }

    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    if (!hostname) {
        throw new Error('URL hostname is missing');
    }

    if (!matchesAllowedHostSuffix(hostname, allowedHostSuffixes)) {
        throw new Error(`Disallowed remote host: ${hostname}`);
    }

    if (allowUnsafeLocalForTest) {
        return { parsedUrl, resolvedAddress: null, resolvedFamily: undefined };
    }

    const lowerHost = hostname.toLowerCase();
    if (lowerHost === 'localhost' || lowerHost.endsWith('.local') || lowerHost.endsWith('.internal') || lowerHost.endsWith('.localhost')) {
        throw new Error(`Blocked internal hostname: ${hostname}`);
    }

    if (net.isIP(hostname) !== 0) {
        if (isPrivateOrReservedIp(hostname)) {
            throw new Error(`Blocked private or reserved IP address: ${hostname}`);
        }
        return { parsedUrl, resolvedAddress: hostname, resolvedFamily: net.isIP(hostname) };
    }

    const records = await dns.promises.lookup(hostname, { all: true });
    if (!Array.isArray(records) || records.length === 0) {
        throw new Error(`Failed to resolve hostname: ${hostname}`);
    }
    for (const rec of records) {
        if (isPrivateOrReservedIp(rec.address)) {
            throw new Error(`Blocked private or reserved resolved IP for ${hostname}`);
        }
    }

    return {
        parsedUrl,
        resolvedAddress: records[0].address,
        resolvedFamily: records[0].family,
    };
}

/**
 * 簡易具容量上限的 LRU Map（以插入／存取順序淘汰最舊鍵值）
 */
class LruCache {
    constructor(maxEntries = DEFAULT_MAX_CACHE_ENTRIES, ttlMs = 0) {
        this.maxEntries = maxEntries;
        this.ttlMs = ttlMs;
        this.map = new Map();
    }

    get(key) {
        if (!this.map.has(key)) return undefined;
        const entry = this.map.get(key);
        if (this.ttlMs > 0 && entry.expiresAt <= Date.now()) {
            this.map.delete(key);
            return undefined;
        }
        // 刷新 LRU 順序
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }

    set(key, value) {
        if (this.map.has(key)) {
            this.map.delete(key);
        }
        while (this.map.size >= this.maxEntries) {
            const oldestKey = this.map.keys().next().value;
            if (oldestKey === undefined) break;
            this.map.delete(oldestKey);
        }
        this.map.set(key, {
            value,
            expiresAt: this.ttlMs > 0 ? Date.now() + this.ttlMs : 0,
        });
    }

    has(key) {
        return this.get(key) !== undefined;
    }

    clear() {
        this.map.clear();
    }

    get size() {
        return this.map.size;
    }
}

/**
 * 帶逾時、回應大小上限、SSRF 防護與重導向限制的 HTTP/HTTPS Buffer 下載
 * @param {string} targetUrl
 * @param {{ timeoutMs?: number, maxBytes?: number, redirectsLeft?: number, headers?: Object, allowUnsafeLocalForTest?: boolean, allowedHostSuffixes?: string[] }} options
 * @returns {Promise<Buffer>}
 */
function fetchBufferWithLimit(targetUrl, options = {}) {
    const {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxBytes = DEFAULT_MAX_BYTES,
        redirectsLeft = MAX_REDIRECTS,
        headers = { 'User-Agent': 'Mozilla/5.0' },
        allowUnsafeLocalForTest = false,
        allowedHostSuffixes = null,
    } = options;

    return (async () => {
        const { parsedUrl, resolvedAddress, resolvedFamily } = await resolveAndValidateRemoteUrl(targetUrl, {
            allowUnsafeLocalForTest,
            allowedHostSuffixes,
        });

        return new Promise((resolve, reject) => {
            const transport = parsedUrl.protocol === 'https:' ? https : http;
            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || undefined,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers,
            };

            if (resolvedAddress) {
                requestOptions.lookup = (_host, opts, cb) => {
                    if (typeof opts === 'function') {
                        return opts(null, resolvedAddress, resolvedFamily);
                    }
                    if (opts && opts.all) {
                        return cb(null, [{ address: resolvedAddress, family: resolvedFamily }]);
                    }
                    return cb(null, resolvedAddress, resolvedFamily);
                };
            }

            const req = transport.request(
                requestOptions,
                (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        res.resume();
                        if (redirectsLeft <= 0) {
                            return reject(new Error(`Too many redirects for ${targetUrl}`));
                        }
                        const nextUrl = new URL(res.headers.location, parsedUrl).toString();
                        return resolve(
                            fetchBufferWithLimit(nextUrl, {
                                timeoutMs,
                                maxBytes,
                                redirectsLeft: redirectsLeft - 1,
                                headers,
                                allowUnsafeLocalForTest,
                                allowedHostSuffixes,
                            })
                        );
                    }

                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        res.resume();
                        return reject(new Error(`HTTP ${res.statusCode} fetching ${targetUrl}`));
                    }

                    const contentLength = Number(res.headers['content-length']);
                    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
                        res.destroy();
                        return reject(new Error(`Response too large (${contentLength} bytes > ${maxBytes})`));
                    }

                    const chunks = [];
                    let totalBytes = 0;
                    let exceeded = false;

                    res.on('data', (chunk) => {
                        if (exceeded) return;
                        totalBytes += chunk.length;
                        if (totalBytes > maxBytes) {
                            exceeded = true;
                            res.destroy();
                            reject(new Error(`Response exceeded maxBytes (${maxBytes})`));
                            return;
                        }
                        chunks.push(chunk);
                    });

                    res.on('end', () => {
                        if (!exceeded) {
                            resolve(Buffer.concat(chunks, totalBytes));
                        }
                    });

                    res.on('error', (err) => {
                        if (!exceeded) reject(err);
                    });
                }
            );

            const timer = setTimeout(() => {
                req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            req.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
            req.on('close', () => clearTimeout(timer));
            req.end();
        });
    })();
}

// 全域共用的有限圖片快取與併發去重表
const sharedImageCache = new LruCache(300, 30 * 60 * 1000);
const inFlightImageLoads = new Map();

/**
 * 安全載入圖片（支援本機路徑、Data URI、HTTP/HTTPS URL），具快取、逾時與併發去重
 * @param {string} source
 * @param {{ cache?: LruCache, timeoutMs?: number, maxBytes?: number, useSharedCache?: boolean }} options
 * @returns {Promise<import('canvas').Image | null>}
 */
async function loadCachedImage(source, options = {}) {
    if (!source || typeof source !== 'string') return null;

    const {
        cache = sharedImageCache,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxBytes = DEFAULT_MAX_BYTES,
        useSharedCache = true,
    } = options;

    if (useSharedCache && cache) {
        const hit = cache.get(source);
        if (hit) return hit;
    }

    const isRemote = source.startsWith('http://') || source.startsWith('https://');
    const isDataUri = source.startsWith('data:');

    if (!isRemote && !isDataUri && !fs.existsSync(source)) {
        return null;
    }

    if (inFlightImageLoads.has(source)) {
        return inFlightImageLoads.get(source);
    }

    const promise = (async () => {
        try {
            let img;
            if (isRemote) {
                const buf = await fetchBufferWithLimit(source, { timeoutMs, maxBytes });
                img = await loadImage(buf);
            } else {
                img = await loadImage(source);
            }
            if (useSharedCache && cache && img) {
                cache.set(source, img);
            }
            return img;
        } catch (err) {
            return null;
        } finally {
            inFlightImageLoads.delete(source);
        }
    })();

    inFlightImageLoads.set(source, promise);
    return promise;
}

module.exports = {
    LruCache,
    fetchBufferWithLimit,
    loadCachedImage,
    sharedImageCache,
    isPrivateOrReservedIp,
    resolveAndValidateRemoteUrl,
};
