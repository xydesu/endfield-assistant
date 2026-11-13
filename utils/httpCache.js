const http = require('http');
const https = require('https');
const fs = require('fs');
const { loadImage } = require('canvas');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_CACHE_ENTRIES = 300;
const MAX_REDIRECTS = 3;

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
 * 帶逾時、回應大小上限與重導向限制的 HTTP/HTTPS Buffer 下載
 * @param {string} targetUrl
 * @param {{ timeoutMs?: number, maxBytes?: number, redirectsLeft?: number, headers?: Object }} options
 * @returns {Promise<Buffer>}
 */
function fetchBufferWithLimit(targetUrl, options = {}) {
    const {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxBytes = DEFAULT_MAX_BYTES,
        redirectsLeft = MAX_REDIRECTS,
        headers = { 'User-Agent': 'Mozilla/5.0' },
    } = options;

    return new Promise((resolve, reject) => {
        let parsedUrl;
        try {
            parsedUrl = new URL(targetUrl);
        } catch (err) {
            return reject(new Error(`Invalid URL: ${targetUrl}`));
        }

        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
            return reject(new Error(`Unsupported protocol: ${parsedUrl.protocol}`));
        }

        const transport = parsedUrl.protocol === 'https:' ? https : http;
        const req = transport.request(
            {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || undefined,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers,
            },
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
};
