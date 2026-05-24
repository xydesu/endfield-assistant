const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ApplicationIntegrationType, 
    InteractionContextType,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const User = require('../../models/User');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

// 儲存各面板的會話狀態以實現多使用者獨立操作及自動逾時清理
const helpViewState = new Map();
const HELP_VIEW_TTL_MS = 60 * 1000;

// 提供選單元件在各語言環境下的客製化翻譯文字
const menuLabels = {
    zh_Hant: {
        home: '🏠 首頁總覽',
        general: '🔧 一般指令',
        attendance: '📅 簽到系統',
        game: '🎮 遊戲資訊',
        admin: '⚙️ 管理功能',
        placeholder: '選擇指令分類以查看詳細說明...',
        footer: '本面板將於 1 分鐘後失效',
        expired: '本面板已逾時失效，請重新輸入 /help 查詢。',
        ownerOnly: '只有使用指令的玩家才能操作此選單！'
    },
    zh_Hans: {
        home: '🏠 首页总览',
        general: '🔧 一般指令',
        attendance: '📅 签到系统',
        game: '🎮 游戏信息',
        admin: '⚙️ 管理功能',
        placeholder: '选择指令分类以查看详细说明...',
        footer: '本面板将于 1 分钟后失效',
        expired: '本面板已超时失效，请重新输入 /help 查询。',
        ownerOnly: '只有使用指令的玩家才能操作此选单！'
    },
    en: {
        home: '🏠 Home Overview',
        general: '🔧 General Commands',
        attendance: '📅 Attendance System',
        game: '🎮 Game Info',
        admin: '⚙️ Admin Functions',
        placeholder: 'Select a category to view details...',
        footer: 'This panel will expire in 1 minute',
        expired: 'This panel has expired. Please run /help again.',
        ownerOnly: 'Only the user who ran the command can use this menu!'
    },
    ja: {
        home: '🏠 ホーム概要',
        general: '🔧 一般コマンド',
        attendance: '📅 ログインシステム',
        game: '🎮 ゲーム情報',
        admin: '⚙️ 管理機能',
        placeholder: '詳細を表示するカテゴリを選択してください...',
        footer: 'このパネルは 1 分後に無効になります',
        expired: 'このパネルは期限切れです。もう一度 /help を実行してください。',
        ownerOnly: 'コマンドを実行したユーザーのみがこのメニューを操作できます！'
    }
};

// 建立指定分類與語系的幫助面板內容
function buildHelpPayload(category, lang, client) {
    const labels = menuLabels[lang] || menuLabels['zh_Hant'];
    const clientId = client.user.id;
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands`;
    const supportUrl = 'https://discord.gg/nPUu2jRmAT';

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

    if (category === 'home') {
        embed.setTitle(t(lang, 'help_title'))
             .setDescription(
                 `👋 **歡迎使用 ${client.user.username}**！\n` +
                 `這是一個專為《明日方舟：終末地》設計的簽到與遊戲資訊助手。\n\n` +
                 `請使用下方的 **下拉選單** 切換指令分類瀏覽詳細說明，\n` +
                 `或點選下方按鈕取得機器人的相關連結。\n\n` +
                 `**📁 指令分類：**\n` +
                 `▫️ ${labels.general}\n` +
                 `▫️ ${labels.attendance}\n` +
                 `▫️ ${labels.game}\n` +
                 `▫️ ${labels.admin}`)
             .setFooter({ text: labels.footer });
    } else if (category === 'general') {
        embed.setTitle(`${labels.general}`)
             .setDescription(
                 `• ${t(lang, 'help_general_help')}\n` +
                 `• ${t(lang, 'help_general_invite')}\n` +
                 `• ${t(lang, 'help_general_support')}\n` +
                 `• ${t(lang, 'help_general_language')}`
             )
             .setFooter({ text: labels.footer });
    } else if (category === 'attendance') {
        embed.setTitle(`${labels.attendance}`)
             .setDescription(
                 `• ${t(lang, 'help_attendance_bind')}\n` +
                 `• ${t(lang, 'help_attendance_unbind')}\n` +
                 `• ${t(lang, 'help_attendance_signin')}\n` +
                 `• ${t(lang, 'help_attendance_schedule')}\n` +
                 `• ${t(lang, 'help_attendance_switch_server')}`
             )
             .setFooter({ text: labels.footer });
    } else if (category === 'game') {
        embed.setTitle(`${labels.game}`)
             .setDescription(
                 `• ${t(lang, 'help_game_profile')}\n` +
                 `• ${t(lang, 'help_game_explore')}\n` +
                 `• ${t(lang, 'help_game_achieve')}\n` +
                 `• ${t(lang, 'help_game_monument')}\n` +
                 `• ${t(lang, 'help_game_operators')}\n` +
                 `• ${t(lang, 'help_game_stamina')}`
             )
             .setFooter({ text: labels.footer });
    } else if (category === 'admin') {
        embed.setTitle(`${labels.admin}`)
             .setDescription(
                 `• ${t(lang, 'help_admin_notify')}`
             )
             .setFooter({ text: labels.footer });
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help:selectCategory')
        .setPlaceholder(labels.placeholder)
        .addOptions([
            { label: labels.home, value: 'home', default: category === 'home' },
            { label: labels.general, value: 'general', default: category === 'general' },
            { label: labels.attendance, value: 'attendance', default: category === 'attendance' },
            { label: labels.game, value: 'game', default: category === 'game' },
            { label: labels.admin, value: 'admin', default: category === 'admin' }
        ]);

    const inviteButton = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(lang === 'en' ? 'Invite Bot' : lang === 'ja' ? 'Botを招待' : '邀請機器人')
        .setURL(inviteUrl)
        .setEmoji('🤖');

    const supportButton = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(lang === 'en' ? 'Support Server' : lang === 'ja' ? 'サポートサーバー' : '支援伺服器')
        .setURL(supportUrl)
        .setEmoji('💬');

    const row1 = new ActionRowBuilder().addComponents(selectMenu);
    const row2 = new ActionRowBuilder().addComponents(inviteButton, supportButton);

    return {
        embeds: [embed],
        components: [row1, row2]
    };
}

// 建立逾時失效時的面板內容
function buildExpiredPayload(embed, lang) {
    const labels = menuLabels[lang] || menuLabels['zh_Hant'];
    const expiredEmbed = EmbedBuilder.from(embed)
        .setFooter({ text: labels.expired });
    return {
        embeds: [expiredEmbed],
        components: []
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('列出所有指令 / List all commands')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    
    async execute(interaction) {
        const user = await User.findByPk(interaction.user.id);
        const lang = user?.language || 'zh_Hant';

        const payload = buildHelpPayload('home', lang, interaction.client);
        const message = await interaction.reply({
            embeds: payload.embeds,
            components: payload.components,
            fetchReply: true
        });

        // 設置防呆與清理定時器，避免伺服器遺留無效互動組件
        const timeoutId = setTimeout(async () => {
            try {
                const expiredPayload = buildExpiredPayload(payload.embeds[0], lang);
                await message.edit(expiredPayload);
            } catch (e) {
                // 忽略訊息已被刪除等異常
            }
            helpViewState.delete(message.id);
        }, HELP_VIEW_TTL_MS);

        helpViewState.set(message.id, {
            userId: interaction.user.id,
            lang,
            timeoutId,
            embed: payload.embeds[0]
        });
    },

    async handleSelectMenu(interaction, action) {
        if (action !== 'selectCategory') return;

        const state = helpViewState.get(interaction.message.id);
        const lang = state?.lang || 'zh_Hant';
        const labels = menuLabels[lang] || menuLabels['zh_Hant'];

        if (!state) {
            return interaction.reply({
                content: labels.expired,
                ephemeral: true
            });
        }

        // 限制僅有原始觸發指令的使用者能操作選單以防止干擾
        if (interaction.user.id !== state.userId) {
            return interaction.reply({
                content: labels.ownerOnly,
                ephemeral: true
            });
        }

        const selectedCategory = interaction.values?.[0] || 'home';
        const payload = buildHelpPayload(selectedCategory, lang, interaction.client);

        // 每次操作皆重置計時器以順延面板有效時間
        clearTimeout(state.timeoutId);
        const timeoutId = setTimeout(async () => {
            try {
                const expiredPayload = buildExpiredPayload(payload.embeds[0], lang);
                await interaction.message.edit(expiredPayload);
            } catch (e) {
                // 忽略訊息已被刪除等異常
            }
            helpViewState.delete(interaction.message.id);
        }, HELP_VIEW_TTL_MS);

        helpViewState.set(interaction.message.id, {
            ...state,
            timeoutId,
            embed: payload.embeds[0]
        });

        await interaction.update({
            embeds: payload.embeds,
            components: payload.components
        });
    }
};
