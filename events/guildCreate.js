const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { EMBED_COLOR } = require('../utils/constants');
const { t } = require('../utils/i18n');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        const client = guild.client;

        // 偵測伺服器預設語系並進行對應對照
        let lang = 'zh_Hant';
        if (guild.preferredLocale) {
            const locale = guild.preferredLocale.toLowerCase();
            if (locale.startsWith('zh')) {
                if (locale === 'zh-tw' || locale === 'zh-hk' || locale === 'zh-mo') {
                    lang = 'zh_Hant';
                } else {
                    lang = 'zh_Hans';
                }
            } else if (locale.startsWith('ja')) {
                lang = 'ja';
            } else if (locale.startsWith('en')) {
                lang = 'en';
            }
        }

        // 尋找適合發送訊息的文字頻道
        let targetChannel = null;

        // 檢查系統頻道是否可用且具備發送訊息與嵌入連結權限
        if (guild.systemChannel) {
            const systemPerms = guild.systemChannel.permissionsFor(guild.members.me);
            if (systemPerms && systemPerms.has([
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.EmbedLinks
            ])) {
                targetChannel = guild.systemChannel;
            }
        }

        // 若系統頻道不可用，則遍歷所有文字頻道尋找第一個有權限的頻道
        if (!targetChannel) {
            const textChannels = guild.channels.cache
                .filter(channel => 
                    channel.type === ChannelType.GuildText && 
                    channel.permissionsFor(guild.members.me)?.has([
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.EmbedLinks
                    ])
                )
                .sort((a, b) => a.position - b.position);

            targetChannel = textChannels.first();
        }

        // 如果找不到任何可寫入的頻道，則放棄發送
        if (!targetChannel) return;

        // 建立精美視覺效果的歡迎 Embed
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(t(lang, 'welcome_title'))
            .setDescription(t(lang, 'welcome_desc'))
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: t(lang, 'welcome_steps_title'), value: t(lang, 'welcome_steps_desc') },
                { name: t(lang, 'welcome_admin_title'), value: t(lang, 'welcome_admin_desc') }
            )
            .setTimestamp();

        // 建立相關連結的互動式按鈕元件
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot+applications.commands`;
        const supportUrl = 'https://discord.gg/nPUu2jRmAT';

        const inviteButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(t(lang, 'invite_title'))
            .setURL(inviteUrl)
            .setEmoji('🤖');

        const supportButton = new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(t(lang, 'support_title'))
            .setURL(supportUrl)
            .setEmoji('💬');

        const row = new ActionRowBuilder().addComponents(inviteButton, supportButton);

        try {
            await targetChannel.send({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error(`無法在伺服器 ${guild.name} (${guild.id}) 發送歡迎訊息:`, error);
        }
    },
};
