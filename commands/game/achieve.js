const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const puppeteer = require('puppeteer');
const UPNG = require('upng-js');
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

// 0-based index of the certify badge APNG frame to use in the static composite.
// Frame 110 (index 109) is a visually complete point in the badge animation.
const CERTIFY_FRAME_INDEX = 109;

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

// ─── PNG builder ──────────────────────────────────────────────────────────────

/**
 * Composites a single frame of the certify APNG onto the static card screenshot
 * and returns a PNG buffer.  Uses frame CERTIFY_FRAME_INDEX (or the last
 * available frame if the APNG has fewer frames).
 *
 * @param {Buffer} cardBuf        PNG screenshot of the card (badges hidden)
 * @param {Buffer} certifyApngBuf APNG binary of the certify badge
 * @param {{x,y,size}[]} positions Device-pixel badge positions on the card
 * @returns {Buffer} PNG binary
 */
function buildCertifyPng(cardBuf, certifyApngBuf, positions) {
    // Decode static card to RGBA
    const cardDecoded = UPNG.decode(cardBuf);
    const [cardRgba] = UPNG.toRGBA8(cardDecoded);
    const cardW = cardDecoded.width;
    const cardH = cardDecoded.height;

    // Decode certify APNG and pick the target frame
    const certifyDecoded = UPNG.decode(certifyApngBuf);
    const certifyFrames  = UPNG.toRGBA8(certifyDecoded);
    if (certifyFrames.length === 0) {
        // APNG has no decoded frames — return the card screenshot unchanged
        return cardBuf;
    }
    const certifyNativeW = certifyDecoded.width;
    const certifyNativeH = certifyDecoded.height;
    const frameIdx = Math.min(CERTIFY_FRAME_INDEX, certifyFrames.length - 1);
    const badgeFrame = certifyFrames[frameIdx];

    // Composite badge frame onto a copy of the card
    const composite = new Uint8Array(cardRgba.slice(0));
    for (const { x, y, size } of positions) {
        const resized = nearestNeighborResize(badgeFrame, certifyNativeW, certifyNativeH, size, size);
        alphaCompositeInPlace(composite, cardW, cardH, resized, size, size, x, y);
    }

    return Buffer.from(UPNG.encode([composite.buffer], cardW, cardH, 0));
}

// ─── Discord command ──────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('achieve')
        .setDescription('查詢光榮之路成就展示')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
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

            const hasCertifyBadge = hasDisplayedCertify(achieve);
            // When compositing the certify badge we suppress the static ::after
            // pseudo-element so we can place the exact APNG frame ourselves.
            const html = await generateAchieveHtml(achieve, { hideCertify: hasCertifyBadge, uid: user.uid, serverId: user.serverId, botName: '終末地簽到小助手' });

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

                let imageBuffer;

                if (hasCertifyBadge) {
                    const [cardBuf, certifyApngBuf] = await Promise.all([
                        cardElement.screenshot({ type: 'png' }),
                        fetchCertifyApng(),
                    ]);
                    const slotIndices = getCertifySlotIndices(achieve);
                    const positions   = await getCertifyPositions(page, slotIndices);
                    imageBuffer = buildCertifyPng(cardBuf, certifyApngBuf, positions);
                } else {
                    imageBuffer = await cardElement.screenshot({ type: 'png' });
                }

                const attachment = new AttachmentBuilder(imageBuffer, { name: 'achieve.png' });
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(`🏅 ${base?.name ?? interaction.user.username} 的光榮之路`)
                    .setImage('attachment://achieve.png')
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

