const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');
const { renderOperatorsCanvas } = require('../../utils/operatorsCanvas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('operators')
        .setDescription('查詢幹員列表 / View operator list')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        let lang = 'zh_Hant';
        try {
            const discordId = interaction.user.id;
            const user = await User.findByPk(discordId);
            lang = user?.language || 'zh_Hant';

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

            const imageBuffer = await renderOperatorsCanvas(chars, { uid: user.uid, serverId: user.serverId, botName: t(lang, 'bot_name'), lang });

            const attachment = new AttachmentBuilder(imageBuffer, { name: 'operators.png' });
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'operators_title')(base?.name ?? interaction.user.username))
                .setImage('attachment://operators.png')
                .setTimestamp();
            await interaction.editReply({ embeds: [embed], files: [attachment] });
        } catch (error) {
            console.error('[operators]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'error_title'))
                .setDescription(t(lang, 'error_query'))
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
