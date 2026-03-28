const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const UPNG = require('upng-js');
const GIFEncoder = require('gif-encoder-2');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const {
    generateAchieveHtml,
    hasDisplayedCertify,
    getCertifySlotIndices,
    fetchCertifyApng,
    SLOT_CLASSES,
} = require('../../utils/achieveHtml');

const DEVICE_SCALE = 2; // must match page.setViewport({ deviceScaleFactor })

// ─── Image utilities ──────────────────────────────────────────────────────────

/** Scale srcAb (srcW×srcH RGBA) to dstW×dstH using nearest-neighbour. */
function nearestNeighborResize(srcAb, srcW, srcH, dstW, dstH) {
    const src = new Uint8Array(srcAb);
    const dst = new Uint8Array(dstW * dstH * 4);
    for (let y = 0; y < dstH; y++) {
        const sy = Math.floor((y * srcH) / dstH);
        for (let x = 0; x < dstW; x++) {
            const sx = Math.floor((x * srcW) / dstW);
            const si = (sy * srcW + sx) * 4;
            const di = (y * dstW + x) * 4;
            dst[di] = src[si];
            dst[di + 1] = src[si + 1];
            dst[di + 2] = src[si + 2];
            dst[di + 3] = src[si + 3];
        }
    }
    return dst.buffer;
}

/**
 * Alpha-composite srcAb (srcW×srcH RGBA) onto dst (Uint8Array, dstW×dstH RGBA)
 * at pixel offset (ox, oy).  dst is modified in-place.
 */
function alphaCompositeInPlace(dst, dstW, dstH, srcAb, srcW, srcH, ox, oy) {
    const src = new Uint8Array(srcAb);
    for (let y = 0; y < srcH; y++) {
        const dy = oy + y;
        if (dy < 0 || dy >= dstH) continue;
        for (let x = 0; x < srcW; x++) {
            const dx = ox + x;
            if (dx < 0 || dx >= dstW) continue;
            const si = (y * srcW + x) * 4;
            const di = (dy * dstW + dx) * 4;
            const srcA = src[si + 3] / 255;
            if (srcA === 0) continue;
            const dstA = dst[di + 3] / 255;
            const outA = srcA + dstA * (1 - srcA);
            if (outA > 0) {
                dst[di]     = Math.round((src[si]     * srcA + dst[di]     * dstA * (1 - srcA)) / outA);
                dst[di + 1] = Math.round((src[si + 1] * srcA + dst[di + 1] * dstA * (1 - srcA)) / outA);
                dst[di + 2] = Math.round((src[si + 2] * srcA + dst[di + 2] * dstA * (1 - srcA)) / outA);
                dst[di + 3] = Math.round(outA * 255);
            }
        }
    }
}

// ─── Certify badge positioning ────────────────────────────────────────────────

/**
 * Returns the device-pixel position+size of each certify badge slot on the
 * card screenshot.  Uses the page DOM so the calculation is exact regardless
 * of CSS changes.
 *
 * @param {import('puppeteer').Page} page
 * @param {number[]} slotIndices  0-based indices into SLOT_CLASSES
 * @returns {Promise<{x: number, y: number, size: number}[]>}
 */
async function getCertifyPositions(page, slotIndices) {
    if (slotIndices.length === 0) return [];

    // Run inside the browser context for accurate vw → px conversion
    const cssPositions = await page.evaluate((classes, indices) => {
        const vw = window.innerWidth;
        const badgeSizeCSS = 1.54028 * vw / 100;
        const badgeTopOffsetCSS = 0.23696 * vw / 100;
        const cardEl = document.querySelector('.bESBDX');
        const cardRect = cardEl ? cardEl.getBoundingClientRect() : { left: 0, top: 0 };

        return indices.map((idx) => {
            const el = document.querySelector('.' + classes[idx]);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {
                // Position relative to card top-left (CSS pixels)
                x: rect.left + rect.width / 2 - badgeSizeCSS / 2 - cardRect.left,
                y: rect.top  + badgeTopOffsetCSS                  - cardRect.top,
                size: badgeSizeCSS,
            };
        }).filter(Boolean);
    }, SLOT_CLASSES, slotIndices);

    // Convert CSS pixels → device pixels
    return cssPositions.map(({ x, y, size }) => ({
        x:    Math.round(x    * DEVICE_SCALE),
        y:    Math.round(y    * DEVICE_SCALE),
        size: Math.round(size * DEVICE_SCALE),
    }));
}

// ─── GIF builder ─────────────────────────────────────────────────────────────

/**
 * Builds an animated GIF by compositing each frame of the certify APNG onto
 * the static card screenshot at the positions specified.
 *
 * @param {Buffer} cardBuf        PNG screenshot of the card (badges hidden)
 * @param {Buffer} certifyApngBuf APNG binary of the certify badge
 * @param {{x,y,size}[]} positions Device-pixel badge positions on the card
 * @returns {Promise<Buffer>} GIF binary
 */
async function buildCertifyGif(cardBuf, certifyApngBuf, positions) {
    // Decode static card to RGBA
    const cardDecoded = UPNG.decode(cardBuf);
    const [cardRgba] = UPNG.toRGBA8(cardDecoded);
    const cardW = cardDecoded.width;
    const cardH = cardDecoded.height;

    // Decode certify APNG: toRGBA8 returns one fully-composited ArrayBuffer per frame
    const certifyDecoded = UPNG.decode(certifyApngBuf);
    const certifyFrames  = UPNG.toRGBA8(certifyDecoded);
    const certifyNativeW = certifyDecoded.width;
    const certifyNativeH = certifyDecoded.height;
    const frameCount     = certifyFrames.length;

    // Per-frame delays in ms (decoded.frames[i].delay is already in ms)
    const delays = certifyDecoded.frames.length > 0
        ? certifyDecoded.frames.map((f) => f.delay || 100)
        : Array(frameCount).fill(100);

    const encoder = new GIFEncoder(cardW, cardH);
    encoder.setRepeat(0); // loop forever
    encoder.start();

    for (let i = 0; i < frameCount; i++) {
        encoder.setDelay(delays[i] || 100);

        // Fresh copy of card pixels for each frame
        const frameRgba = new Uint8Array(cardRgba.slice(0));

        for (const { x, y, size } of positions) {
            const resized = nearestNeighborResize(certifyFrames[i], certifyNativeW, certifyNativeH, size, size);
            alphaCompositeInPlace(frameRgba, cardW, cardH, resized, size, size, x, y);
        }

        encoder.addFrame(frameRgba);
    }

    encoder.finish();
    return Buffer.from(encoder.out.getData());
}

// ─── Discord command ──────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('achieve')
        .setDescription('查詢光榮之路成就展示'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
            const discordId = interaction.user.id;
            const user = await User.findByPk(discordId);

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 尚未綁定')
                    .setDescription('您尚未綁定帳號，請先使用 `/bind` 指令進行綁定。')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const result = await getCardDetail(user);

            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 查詢失敗')
                    .setDescription(result.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const { base, achieve } = result.detail;

            if (!achieve) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 無成就資料')
                    .setDescription('目前無光榮之路成就資料。')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const useGif = hasDisplayedCertify(achieve);
            // When building a GIF we hide the static certify badges from the
            // Chromium screenshot; they are composited frame-by-frame instead.
            const html = await generateAchieveHtml(achieve, { hideCertify: useGif });

            let browser;
            try {
                browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                });
                const page = await browser.newPage();
                await page.setViewport({ width: 1400, height: 400, deviceScaleFactor: DEVICE_SCALE });
                await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

                const cardElement = await page.$('.bESBDX');
                if (!cardElement) throw new Error('Card element not found');

                let imageBuffer, fileName;

                if (useGif) {
                    const [cardBuf, certifyApngBuf] = await Promise.all([
                        cardElement.screenshot({ type: 'png' }),
                        fetchCertifyApng(),
                    ]);
                    const slotIndices = getCertifySlotIndices(achieve);
                    const positions   = await getCertifyPositions(page, slotIndices);
                    imageBuffer = await buildCertifyGif(cardBuf, certifyApngBuf, positions);
                    fileName = 'achieve.gif';
                } else {
                    imageBuffer = await cardElement.screenshot({ type: 'png' });
                    fileName = 'achieve.png';
                }

                const attachment = new AttachmentBuilder(imageBuffer, { name: fileName });
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(`🏅 ${base?.name ?? interaction.user.username} 的光榮之路`)
                    .setImage(`attachment://${fileName}`)
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed], files: [attachment] });
            } finally {
                if (browser) await browser.close().catch((err) => console.error('[achieve] browser close error:', err));
            }
        } catch (error) {
            console.error('[achieve]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('❌ 發生錯誤')
                .setDescription('查詢時發生錯誤，請稍後再試。')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
