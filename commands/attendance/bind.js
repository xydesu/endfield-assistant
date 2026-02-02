const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const { encrypt } = require('../../utils/encryption');
const { EMBED_COLOR } = require('../../utils/constants');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bind')
        .setDescription('綁定 Endfield 帳號 (包含教學與腳本)'),

    async execute(interaction) {
        // 1. Create Embed Guide
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('Endfield 自動簽到綁定教學')
            .setDescription('請依照以下步驟獲取您的憑證並進行綁定：')
            .addFields(
                { name: '步驟 1', value: '使用電腦瀏覽器開啟 [每日簽到網站](https://game.skport.com/endfield/sign-in) 並登入帳號。' },
                { name: '步驟 2', value: '按下 `F12` 開啟開發者工具，切換至 `Console` 分頁。' },
                { name: '步驟 3', value: '複製下方指令並貼上到 Console 中執行：' },
                { name: '指令', value: '```javascript\nfetch("https://gist.githubusercontent.com/xydesu/588fd21394fb7fd62710fa1b88bb4777/raw/4ddf96196fb9cd9572cf2ddba0c6f61f9769442b/get_cred.js").then(r=>r.text()).then(t=>eval(t))\n```' },
                { name: '步驟 4', value: '執行後 Console 將會直接顯示一段 **JSON**，請完整複製。' },
                { name: '步驟 5', value: '點擊下方「輸入 Config」按鈕，將 JSON 貼上並送出。' }
            )
            .setFooter({ text: '注意：請勿將憑證洩漏給他人' });

        // 2. Button
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bind:enter:${interaction.user.id}`)
                    .setLabel('輸入 Config')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔐')
            );

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    },

    async handleButton(interaction, action) {
        if (action === 'enter') {
            const [, , targetUserId] = interaction.customId.split(':');
            if (targetUserId && interaction.user.id !== targetUserId) {
                const embed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('❌ 權限不足')
                    .setDescription('只有指令使用者可以操作此按鈕。')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('bind:submit')
                .setTitle('綁定帳號');

            const jsonInput = new TextInputBuilder()
                .setCustomId('jsonInput')
                .setLabel("請貼上腳本生成的 JSON")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('{"cred": "...", "uid": "...", "serverId": "..."}')
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(jsonInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        }
    },

    async handleModal(interaction, action) {
        if (action === 'submit') {
            const jsonStr = interaction.fields.getTextInputValue('jsonInput');

            let config;
            try {
                config = JSON.parse(jsonStr);
            } catch (e) {
                const embed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('❌ JSON 格式錯誤')
                    .setDescription('請確保您完整複製了腳本生成的內容。')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Support both new simplified format and old format (headers object)
            let cred = config.cred;
            let uid = config.uid;
            let serverId = config.serverId;

            // Backward compatibility / robustness
            if (!uid && config.headers && config.headers['sk-game-role']) {
                cred = config.cred || config.headers['cred']; // header might be in config.cred if old script
                const parts = config.headers['sk-game-role'].split('_');
                if (parts.length >= 3) {
                    uid = parts[1];
                    serverId = parts.slice(2).join('_');
                }
            }

            if (!cred || !uid || !serverId) {
                const embed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('❌ 缺少必要欄位')
                    .setDescription('無法解析 JSON。請確認您使用了最新的腳本並複製了完整內容 (需包含 cred, uid, serverId)。')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const discordId = interaction.user.id;

            try {
                await User.upsert({
                    discordId: discordId,
                    cred: encrypt(cred),
                    uid: uid,
                    serverId: serverId
                });

                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('✅ 綁定成功')
                    .setDescription(`UID: \`${uid}\`\nServer ID: \`${serverId}\`\n\n您可以繼續使用 \`/schedule\` 設定每日自動簽到時間。`)
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
            } catch (error) {
                console.error(error);
                const embed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('❌ 綁定失敗')
                    .setDescription('資料庫發生錯誤，請稍後再試。')
                    .setTimestamp();
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    }
};
