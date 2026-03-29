const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const User = require('../../models/User');
const { encrypt } = require('../../utils/encryption');
const { EMBED_COLOR } = require('../../utils/constants');
const { getBindingList } = require('../../utils/attendance');

// Temporarily hold raw cred while user is choosing a role (TTL: 10 minutes)
const pendingCredentials = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000;

// Fallback: map server display name → numeric server ID
const SERVER_NAME_TO_ID = {
    'asia': '2',
    'americas / europe': '3',
    'americas/europe': '3',
};

function resolveServerId(role) {
    if (role.serverId) return role.serverId;
    return SERVER_NAME_TO_ID[(role.serverName || '').toLowerCase().trim()] || null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bind')
        .setDescription('綁定 Endfield 帳號 (包含教學與腳本)'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('Endfield 自動簽到綁定教學')
            .setDescription('請依照以下步驟獲取您的憑證並進行綁定：')
            .addFields(
                { name: '步驟 1', value: '使用電腦瀏覽器開啟 [每日簽到網站](https://game.skport.com/endfield/sign-in) 並登入帳號。' },
                { name: '步驟 2', value: '按下 `F12` 開啟開發者工具，切換至 `Console` 分頁。' },
                { name: '步驟 3', value: '複製下方指令並貼上到 Console 中執行：' },
                { name: '指令', value: '```javascript\nfetch("https://gist.githubusercontent.com/xydesu/588fd21394fb7fd62710fa1b88bb4777/raw/bab7ac35faf461b2ad17a71b6a9143f58a0eaf58/get_cred.js").then(r=>r.text()).then(t=>eval(t))\n```' },
                { name: '步驟 4', value: '執行後 Console 將顯示 JSON 資訊，直接複製整段 JSON 輸出（或只複製 `cred` 欄位的值）。' },
                { name: '步驟 5', value: '點擊下方「輸入 Cred」按鈕貼上並送出，機器人會自動查詢可用角色供您選擇。' }
            )
            .setFooter({ text: '注意：請勿將憑證洩漏給他人' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bind:enter:${interaction.user.id}`)
                    .setLabel('輸入 Cred')
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
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 權限不足')
                    .setDescription('只有指令使用者可以操作此按鈕。')
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('bind:credSubmit')
                .setTitle('綁定帳號');

            const credInput = new TextInputBuilder()
                .setCustomId('credInput')
                .setLabel('請輸入您的 Cred')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('貼上腳本輸出的完整 JSON，或只貼上 cred 值')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(credInput));
            await interaction.showModal(modal);
        }
    },

    async handleModal(interaction, action) {
        if (action === 'credSubmit') {
            await interaction.deferReply({ ephemeral: true });

            const inputText = interaction.fields.getTextInputValue('credInput').trim();

            // Accept either a raw cred string or a JSON object containing a cred field
            let cred = inputText;
            try {
                const parsed = JSON.parse(inputText);
                if (parsed && parsed.cred) cred = parsed.cred;
            } catch {
                // Not JSON — treat the whole string as the raw cred value
            }

            if (!cred) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 輸入錯誤')
                    .setDescription('無法解析 cred，請確認您複製了正確的內容。')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            let roles;
            try {
                roles = await getBindingList(cred);
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 查詢失敗')
                    .setDescription(`無法取得角色資訊：${error.message.substring(0, 200)}\n請確認您的 Cred 是否有效。`)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            if (!roles || roles.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 查無角色')
                    .setDescription('未找到任何角色資料，請確認您已登入遊戲帳號。')
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // Store cred temporarily while user picks a role (encrypted at rest)
            const userId = interaction.user.id;
            pendingCredentials.set(userId, { encryptedCred: encrypt(cred), expiresAt: Date.now() + PENDING_TTL_MS });

            // Prune expired entries
            for (const [k, v] of pendingCredentials) {
                if (v.expiresAt < Date.now()) pendingCredentials.delete(k);
            }

            const options = roles.map(role => {
                const sid = resolveServerId(role);
                return {
                    label: `${role.serverName} | ${role.nickname}`.substring(0, 100),
                    description: `等級: ${role.level} | RoleID: ${role.roleId}`.substring(0, 100),
                    value: `${role.roleId}_${sid ?? 'unknown'}`.substring(0, 100),
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('bind:select')
                .setPlaceholder('請選擇要綁定的角色...')
                .addOptions(options);

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('🎮 選擇綁定角色')
                .setDescription(`找到 **${roles.length}** 個角色，請從下方選單選擇要進行自動簽到的角色。`)
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(selectMenu)]
            });
        }
    },

    async handleSelectMenu(interaction, action) {
        if (action === 'select') {
            const userId = interaction.user.id;
            const pending = pendingCredentials.get(userId);

            if (!pending || pending.expiresAt < Date.now()) {
                pendingCredentials.delete(userId);
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 操作逾時')
                    .setDescription('綁定選擇已逾時，請重新執行 `/bind` 指令。')
                    .setTimestamp();
                return interaction.update({ embeds: [embed], components: [] });
            }

            const selectedValue = interaction.values[0];
            // Value format: "{roleId}_{serverId}"  (both are numeric strings, no underscores)
            const lastUnderscore = selectedValue.lastIndexOf('_');
            if (lastUnderscore === -1) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 無效的選擇')
                    .setDescription('無法解析選取的角色資料，請重新執行 `/bind` 指令。')
                    .setTimestamp();
                return interaction.update({ embeds: [embed], components: [] });
            }
            const roleId = selectedValue.substring(0, lastUnderscore);
            const serverId = selectedValue.substring(lastUnderscore + 1);

            if (!roleId || serverId === 'unknown') {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 無效的選擇')
                    .setDescription('無法解析伺服器 ID，請重新執行 `/bind` 指令。')
                    .setTimestamp();
                return interaction.update({ embeds: [embed], components: [] });
            }

            try {
                await User.upsert({
                    discordId: userId,
                    cred: pending.encryptedCred,
                    uid: roleId,
                    serverId: serverId,
                });
                pendingCredentials.delete(userId);

                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('✅ 綁定成功')
                    .setDescription(`RoleID: \`${roleId}\`\nServer ID: \`${serverId}\`\n\n您可以繼續使用 \`/schedule\` 設定每日自動簽到時間。`)
                    .setTimestamp();
                await interaction.update({ embeds: [embed], components: [] });
            } catch (error) {
                console.error(error);
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('❌ 綁定失敗')
                    .setDescription('資料庫發生錯誤，請稍後再試。')
                    .setTimestamp();
                await interaction.update({ embeds: [embed], components: [] });
            }
        }
    }
};
