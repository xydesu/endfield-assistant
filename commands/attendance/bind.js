const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const User = require('../../models/User');
const { encrypt } = require('../../utils/encryption');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');
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
        .setDescription('綁定 Endfield 帳號 / Bind Endfield account'),

    async execute(interaction) {
        const user = await User.findByPk(interaction.user.id);
        const lang = user?.language || 'zh_tw';

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(t(lang, 'bind_tutorial_title'))
            .setDescription(t(lang, 'bind_tutorial_desc'))
            .addFields(
                { name: '步驟 1 / Step 1', value: t(lang, 'bind_step1') },
                { name: '步驟 2 / Step 2', value: t(lang, 'bind_step2') },
                { name: '步驟 3 / Step 3', value: t(lang, 'bind_step3') },
                { name: '指令 / Script', value: '```javascript\nfetch("https://gist.githubusercontent.com/xydesu/e77a5769292b80801fa246a4e068af47/raw/e0fa110679e6164efda76cfb87d12cfcce287ddb/cred.js").then(r=>r.text()).then(t=>eval(t))\n```' },
                { name: '步驟 4 / Step 4', value: t(lang, 'bind_step4') },
                { name: '步驟 5 / Step 5', value: t(lang, 'bind_step5') }
            )
            .setFooter({ text: t(lang, 'bind_footer') });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bind:enter:${interaction.user.id}`)
                    .setLabel(t(lang, 'bind_enter_btn'))
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
            const user = await User.findByPk(interaction.user.id);
            const lang = user?.language || 'zh_tw';

            if (targetUserId && interaction.user.id !== targetUserId) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'bind_permission_title'))
                    .setDescription(t(lang, 'bind_permission_desc'))
                    .setTimestamp();
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('bind:credSubmit')
                .setTitle(t(lang, 'bind_modal_title'));

            const credInput = new TextInputBuilder()
                .setCustomId('credInput')
                .setLabel(t(lang, 'bind_modal_label'))
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder(t(lang, 'bind_modal_placeholder'))
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(credInput));
            await interaction.showModal(modal);
        }
    },

    async handleModal(interaction, action) {
        if (action === 'credSubmit') {
            await interaction.deferReply({ ephemeral: true });

            const user = await User.findByPk(interaction.user.id);
            const lang = user?.language || 'zh_tw';

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
                    .setTitle(t(lang, 'bind_input_error_title'))
                    .setDescription(t(lang, 'bind_input_error_desc'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            let roles;
            try {
                roles = await getBindingList(cred);
            } catch (error) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'query_failed_title'))
                    .setDescription(t(lang, 'bind_fetch_fail_desc')(error.message.substring(0, 200)))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            if (!roles || roles.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'bind_no_roles_title'))
                    .setDescription(t(lang, 'bind_no_roles_desc'))
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
                    description: `${t(lang, 'bind_role_level')(role.level)} | RoleID: ${role.roleId}`.substring(0, 100),
                    value: `${role.roleId}_${sid ?? 'unknown'}`.substring(0, 100),
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('bind:select')
                .setPlaceholder(t(lang, 'bind_select_placeholder'))
                .addOptions(options);

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'bind_select_title'))
                .setDescription(t(lang, 'bind_select_desc')(roles.length))
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
            const user = await User.findByPk(userId);
            const lang = user?.language || 'zh_tw';
            const pending = pendingCredentials.get(userId);

            if (!pending || pending.expiresAt < Date.now()) {
                pendingCredentials.delete(userId);
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'bind_expired_title'))
                    .setDescription(t(lang, 'bind_expired_desc'))
                    .setTimestamp();
                return interaction.update({ embeds: [embed], components: [] });
            }

            const selectedValue = interaction.values[0];
            // Value format: "{roleId}_{serverId}"  (both are numeric strings, no underscores)
            const lastUnderscore = selectedValue.lastIndexOf('_');
            if (lastUnderscore === -1) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'bind_invalid_title'))
                    .setDescription(t(lang, 'bind_invalid_desc'))
                    .setTimestamp();
                return interaction.update({ embeds: [embed], components: [] });
            }
            const roleId = selectedValue.substring(0, lastUnderscore);
            const serverId = selectedValue.substring(lastUnderscore + 1);

            if (!roleId || serverId === 'unknown') {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'bind_invalid_title'))
                    .setDescription(t(lang, 'bind_invalid_server_desc'))
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
                    .setTitle(t(lang, 'bind_success_title'))
                    .setDescription(t(lang, 'bind_success_desc')(roleId, serverId))
                    .setTimestamp();
                await interaction.update({ embeds: [embed], components: [] });
            } catch (error) {
                console.error(error);
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'bind_fail_title'))
                    .setDescription(t(lang, 'db_error'))
                    .setTimestamp();
                await interaction.update({ embeds: [embed], components: [] });
            }
        }
    }
};
