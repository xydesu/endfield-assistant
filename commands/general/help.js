const { SlashCommandBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType } = require('discord.js');
const User = require('../../models/User');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('列出所有指令 / List all commands')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
    async execute(interaction) {
        const user = await User.findByPk(interaction.user.id);
        const lang = user?.language || 'zh_tw';

        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
            .setTitle(t(lang, 'help_title'))
            .setDescription(t(lang, 'help_desc'))
            .addFields(
                {
                    name: t(lang, 'help_general'),
                    value: [
                        t(lang, 'help_general_help'),
                        t(lang, 'help_general_invite'),
                        t(lang, 'help_general_language'),
                    ].join('\n'),
                },
                {
                    name: t(lang, 'help_attendance'),
                    value: [
                        t(lang, 'help_attendance_bind'),
                        t(lang, 'help_attendance_unbind'),
                        t(lang, 'help_attendance_signin'),
                        t(lang, 'help_attendance_schedule'),
                    ].join('\n'),
                },
                {
                    name: t(lang, 'help_game'),
                    value: [
                        t(lang, 'help_game_profile'),
                        t(lang, 'help_game_explore'),
                        t(lang, 'help_game_achieve'),
                        t(lang, 'help_game_operators'),
                        t(lang, 'help_game_stamina'),
                    ].join('\n'),
                },
                {
                    name: t(lang, 'help_admin'),
                    value: t(lang, 'help_admin_notify'),
                }
            )
            .setFooter({ text: t(lang, 'help_footer') })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
