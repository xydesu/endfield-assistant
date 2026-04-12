const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const puppeteer = require('puppeteer');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { generateOperatorsHtml, COLS, CARD_W, IMAGE_H, NAME_H, GAP, PADDING } = require('../../utils/operatorsHtml');

const DEVICE_SCALE = 2;

// Extra pixels added to the viewport height so nothing is clipped during rendering
const VIEWPORT_HEIGHT_BUFFER = 100;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('operators')
        .setDescription('查詢幹員列表')
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

            const { base, chars } = result.detail;

            if (!chars || chars.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 無幹員資料')
                    .setDescription('目前無幹員資料。')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // Temporary diagnostic: log the first charData so the field names/values are visible in production logs
            if (chars.length > 0) {
                console.log('[operators] sample charData keys:', Object.keys(chars[0].charData || {}));
                console.log('[operators] sample charData:', JSON.stringify(chars[0].charData, null, 2));
                console.log('[operators] sample char (top-level):', JSON.stringify({ level: chars[0].level, evolvePhase: chars[0].evolvePhase, potentialLevel: chars[0].potentialLevel }));
            }

            const html = await generateOperatorsHtml(chars);

            const viewportW = COLS * CARD_W + (COLS - 1) * GAP + PADDING * 2;
            const rows = Math.ceil(chars.length / COLS);
            const viewportH = rows * (IMAGE_H + NAME_H) + (rows - 1) * GAP + PADDING * 2 + VIEWPORT_HEIGHT_BUFFER;

            let browser;
            try {
                browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                });
                const page = await browser.newPage();
                await page.setViewport({ width: viewportW, height: viewportH, deviceScaleFactor: DEVICE_SCALE });
                await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

                const wrapperEl = await page.$('#wrapper');
                if (!wrapperEl) throw new Error('Wrapper element not found');

                const imageBuffer = await wrapperEl.screenshot({ type: 'png' });

                const attachment = new AttachmentBuilder(imageBuffer, { name: 'operators.png' });
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(`🧑‍✈️ ${base?.name ?? interaction.user.username} 的幹員列表`)
                    .setImage('attachment://operators.png')
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed], files: [attachment] });
            } finally {
                if (browser) await browser.close().catch((err) => console.error('[operators] browser close error:', err));
            }
        } catch (error) {
            console.error('[operators]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('❌ 發生錯誤')
                .setDescription('查詢時發生錯誤，請稍後再試。')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
