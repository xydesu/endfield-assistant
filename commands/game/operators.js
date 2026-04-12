const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const puppeteer = require('puppeteer');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { generateOperatorsHtml } = require('../../utils/operatorsHtml');

// Viewport width should comfortably fit 4 operator cards (≈85 px each) plus padding
const VIEWPORT_WIDTH = 600;
const VIEWPORT_HEIGHT = 400;
const PAGE_LOAD_TIMEOUT_MS = 30000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('operators')
        .setDescription('查詢展示幹員清單')
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

            const { base, config, chars } = result.detail;

            if (!config?.charSwitch || !config?.charIds?.length) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 無展示幹員')
                    .setDescription('目前未設定展示幹員。')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // Build an id→char lookup and preserve the display order from charIds
            const charMap = new Map((chars ?? []).map((c) => [c.id, c]));
            const displayChars = config.charIds
                .map((id) => charMap.get(id))
                .filter(Boolean);

            if (displayChars.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 無展示幹員')
                    .setDescription('目前未設定展示幹員。')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            const html = await generateOperatorsHtml(displayChars);

            let browser;
            try {
                browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                });
                const page = await browser.newPage();
                await page.setViewport({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, deviceScaleFactor: 2 });
                await page.setContent(html, { waitUntil: 'networkidle0', timeout: PAGE_LOAD_TIMEOUT_MS });

                const gridElement = await page.$('.operator-list__Scroll-evdVpD');
                if (!gridElement) throw new Error('Operator grid element not found');

                const imageBuffer = await gridElement.screenshot({ type: 'png' });

                const attachment = new AttachmentBuilder(imageBuffer, { name: 'operators.png' });
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(`🧑‍💼 ${base?.name ?? interaction.user.username} 的展示幹員`)
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
