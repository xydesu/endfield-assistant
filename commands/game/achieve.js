const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { generateAchieveHtml } = require('../../utils/achieveHtml');

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

                const screenshot = await cardElement.screenshot({ type: 'png' });
                const attachment = new AttachmentBuilder(screenshot, { name: 'achieve.png' });
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
