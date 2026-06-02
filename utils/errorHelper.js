const { EmbedBuilder } = require('discord.js');
const { EMBED_COLOR } = require('./constants');
const { t } = require('./i18n');

/**
 * 統一處理 Discord 指令執行錯誤，並在開發模式下提供完整錯誤堆疊 (Stack Trace)
 *
 * @param {import('discord.js').Interaction} interaction Discord 互動事件
 * @param {Error} error 錯誤物件
 * @param {string} lang 當前語系
 */
function replyWithError(interaction, error, lang = 'zh_Hant') {
    console.error(error);
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    let description = typeof t(lang, 'error_query') === 'function' ? t(lang, 'error_query')() : t(lang, 'error_query');
    if (isDev && error && error.stack) {
        // 開發模式下追加代碼堆疊以利 Debug
        description += `\n\n**[Dev Mode Error Stack]**\n\`\`\`javascript\n${error.stack.substring(0, 1500)}\n\`\`\``;
    }

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(t(lang, 'error_title'))
        .setDescription(description)
        .setTimestamp();

    if (interaction.replied || interaction.deferred) {
        return interaction.editReply({ embeds: [embed], files: [] }).catch(console.error);
    } else {
        return interaction.reply({ embeds: [embed], ephemeral: true }).catch(console.error);
    }
}

module.exports = { replyWithError };
