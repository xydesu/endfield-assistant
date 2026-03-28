const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const UPNG = require('upng-js');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { generateAchieveHtml, hasDisplayedCertify } = require('../../utils/achieveHtml');

const APNG_FRAME_INTERVAL_MS = 50; // ~20 fps
const APNG_TOTAL_DURATION_MS = 2000; // 2 s covers most badge animation loops
const APNG_FRAME_COUNT = Math.round(APNG_TOTAL_DURATION_MS / APNG_FRAME_INTERVAL_MS);
const APNG_START_DELAY_MS = 100; // let the APNG begin its first cycle before capturing

async function captureApng(cardElement) {
    // Brief pause so the APNG has started its first cycle
    await new Promise((r) => setTimeout(r, APNG_START_DELAY_MS));

    const pngBuffers = [];
    for (let i = 0; i < APNG_FRAME_COUNT; i++) {
        pngBuffers.push(await cardElement.screenshot({ type: 'png' }));
        if (i < APNG_FRAME_COUNT - 1) {
            await new Promise((r) => setTimeout(r, APNG_FRAME_INTERVAL_MS));
        }
    }

    const firstDecoded = UPNG.decode(pngBuffers[0]);
    const { width, height } = firstDecoded;

    const rgbaFrames = pngBuffers.map((buf) => UPNG.toRGBA8(UPNG.decode(buf))[0]);
    const delays = new Array(APNG_FRAME_COUNT).fill(APNG_FRAME_INTERVAL_MS);

    return Buffer.from(UPNG.encode(rgbaFrames, width, height, 0, delays));
}

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

            const html = await generateAchieveHtml(achieve);

            let browser;
            try {
                browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                });
                const page = await browser.newPage();
                await page.setViewport({ width: 1400, height: 400, deviceScaleFactor: 2 });
                await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

                const cardElement = await page.$('.bESBDX');
                if (!cardElement) throw new Error('Card element not found');

                const useApng = hasDisplayedCertify(achieve);
                const imageBuffer = useApng
                    ? await captureApng(cardElement)
                    : await cardElement.screenshot({ type: 'png' });

                const fileName = 'achieve.png';
                const attachment = new AttachmentBuilder(imageBuffer, { name: fileName });
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
