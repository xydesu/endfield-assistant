const { SlashCommandBuilder, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const User = require('../../models/User');
const { decrypt } = require('../../utils/encryption');
const { getBindingList } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

// 映射伺服器展示名稱至數值 ID，作為 API 請求的參數
const SERVER_NAME_TO_ID = {
    'asia': '2',
    'americas / europe': '3',
    'americas/europe': '3',
};

// 解析角色所在的伺服器 ID
function resolveServerId(role) {
    if (role.serverId) return role.serverId;
    return SERVER_NAME_TO_ID[(role.serverName || '').toLowerCase().trim()] || null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('switch-server')
        .setDescription('切換至同帳號下的其他伺服器/角色 / Switch server or role')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        // 使用 ephemeral 以維護玩家帳號資訊隱私
        await interaction.deferReply({ ephemeral: true });

        const userId = interaction.user.id;
        const user = await User.findByPk(userId);
        const lang = user?.language || 'zh_Hant';

        // 確保使用者已綁定，以取得解密所需憑證
        if (!user) {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'not_bound_title'))
                .setDescription(t(lang, 'not_bound_desc'))
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        let roles;
        try {
            const cred = decrypt(user.cred);
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

        // 檢查是否僅有單一角色，若是則無需切換
        const currentRole = roles.find(r => r.roleId === user.uid && resolveServerId(r) === user.serverId);
        if (roles.length === 1 && currentRole) {
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'switch_server_no_other_roles_title'))
                .setDescription(t(lang, 'switch_server_no_other_roles_desc'))
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        // 建立角色選單選項，並標記當前選取之角色
        const options = roles.map(role => {
            const sid = resolveServerId(role);
            const isCurrent = (role.roleId === user.uid && sid === user.serverId);
            const currentLabelSuffix = isCurrent 
                ? (lang === 'en' ? ' (Current)' : lang === 'ja' ? ' (現在)' : ' (當前)') 
                : '';
            
            return {
                label: `${role.serverName} | ${role.nickname}${currentLabelSuffix}`.substring(0, 100),
                description: `${t(lang, 'bind_role_level')(role.level)} | RoleID: ${role.roleId}`.substring(0, 100),
                value: `${role.roleId}_${sid ?? 'unknown'}`.substring(0, 100),
                default: isCurrent
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('switch-server:select')
            .setPlaceholder(t(lang, 'switch_server_select_placeholder'))
            .addOptions(options);

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(t(lang, 'switch_server_select_title'))
            .setDescription(t(lang, 'switch_server_select_desc')(roles.length))
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
    },

    async handleSelectMenu(interaction, action) {
        if (action === 'select') {
            await interaction.deferUpdate();

            const userId = interaction.user.id;
            const user = await User.findByPk(userId);
            const lang = user?.language || 'zh_Hant';

            const selectedValue = interaction.values[0];
            const lastUnderscore = selectedValue.lastIndexOf('_');
            if (lastUnderscore === -1) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'bind_invalid_title'))
                    .setDescription(t(lang, 'bind_invalid_desc'))
                    .setTimestamp();
                return interaction.followUp({ embeds: [embed], ephemeral: true });
            }

            const roleId = selectedValue.substring(0, lastUnderscore);
            const serverId = selectedValue.substring(lastUnderscore + 1);

            if (!roleId || serverId === 'unknown') {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'bind_invalid_title'))
                    .setDescription(t(lang, 'bind_invalid_server_desc'))
                    .setTimestamp();
                return interaction.followUp({ embeds: [embed], ephemeral: true });
            }

            try {
                // 更新使用者資料庫中當前選用的角色與伺服器資訊
                await user.update({
                    uid: roleId,
                    serverId: serverId,
                });

                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'switch_server_success_title'))
                    .setDescription(t(lang, 'switch_server_success_desc')(roleId, serverId))
                    .setTimestamp();

                // 切換完成後移除選單以防止重複操作
                await interaction.editReply({ embeds: [embed], components: [] });
            } catch (error) {
                console.error('[switch-server]', error);
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'error_title'))
                    .setDescription(t(lang, 'db_error'))
                    .setTimestamp();
                await interaction.editReply({ embeds: [embed], components: [] });
            }
        }
    }
};
