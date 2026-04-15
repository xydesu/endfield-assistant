const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const puppeteer = require('puppeteer');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');
const { generateOperatorsHtml, COLS, CARD_W, IMAGE_H, NAME_H, WEAPON_H, GAP, PADDING } = require('../../utils/operatorsHtml');

const DEVICE_SCALE = 2;

// Extra pixels added to the viewport height so nothing is clipped during rendering
const VIEWPORT_HEIGHT_BUFFER = 100;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('operators')
        .setDescription('查詢幹員列表 / View operator list')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        try {
            const discordId = interaction.user.id;
            const user = await User.findByPk(discordId);
            const lang = user?.language || 'zh_tw';

            if (!user) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'not_bound_title'))
                    .setDescription(t(lang, 'not_bound_desc'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const result = await getCardDetail(user);

            if (!result.success) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
                    .setDescription(result.message)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const { base, chars } = result.detail;

            if (!chars || chars.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'operators_no_data_title'))
                    .setDescription(t(lang, 'operators_no_data_desc'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const html = await generateOperatorsHtml(chars, { uid: user.uid, serverId: user.serverId, botName: t(lang, 'bot_name') });

            const viewportW = COLS * CARD_W + (COLS - 1) * GAP + PADDING * 2;
            const rows = Math.ceil(chars.length / COLS);
            const viewportH = rows * (IMAGE_H + NAME_H + WEAPON_H) + (rows - 1) * GAP + PADDING * 2 + VIEWPORT_HEIGHT_BUFFER;

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
                    .setTitle(t(lang, 'operators_title')(base?.name ?? interaction.user.username))
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
                .setTitle(t('zh_tw', 'error_title'))
                .setDescription(t('zh_tw', 'error_query'))
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
