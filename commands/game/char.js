const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ApplicationIntegrationType, InteractionContextType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const User = require('../../models/User');
const { getCardDetail } = require('../../utils/attendance');
const { EMBED_COLOR } = require('../../utils/constants');
const { t } = require('../../utils/i18n');
const { renderCharacter } = require('../../utils/charRender');

const { toTraditional } = require('../../utils/toTraditional');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('char')
        .setDescription('查詢幹員詳細資料與配置 / View character detailed info')
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

            const chars = result.detail.chars;
            if (!chars || chars.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(t(lang, 'operators_no_data_title'))
                    .setDescription(t(lang, 'operators_no_data_desc'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }

            // 按等級降序，再按稀有度降序排序，取前 25 個
            const sortedChars = chars.sort((a, b) => {
                if (b.level !== a.level) {
                    return b.level - a.level;
                }
                const rarityA = parseInt(a.charData?.rarity?.value) || 0;
                const rarityB = parseInt(b.charData?.rarity?.value) || 0;
                return rarityB - rarityA;
            });
            const displayChars = sortedChars.slice(0, 25);

            // 建立選單選項
            const selectOptions = displayChars.map(c => {
                const profVal = c.charData.profession ? toTraditional(c.charData.profession.value) : '';
                const propVal = c.charData.property ? toTraditional(c.charData.property.value) : '';
                return {
                    label: `${c.charData.name} (Lv.${c.level})`,
                    description: `${profVal} | ${propVal}`,
                    value: c.charData.name
                };
            });

            // 多語言支援選單內容
            let placeholder = '請選擇要查看詳細配置的幹員...';
            let selectTitle = '👥 選擇幹員';
            let selectDesc = '請從下方下拉選單中選擇您想要查看詳細配置的幹員（清單僅顯示等級最高的前 25 位）：';
            
            if (lang === 'zh_Hans') {
                placeholder = '请选择要查看详细配置的干员...';
                selectTitle = '👥 选择干员';
                selectDesc = '请从下方下拉选单中选择您想要查看详细配置的干员（清单仅显示等级最高的前 25 位）：';
            } else if (lang === 'en') {
                placeholder = 'Select a character to view detailed loadout...';
                selectTitle = '👥 Select Character';
                selectDesc = 'Please select a character from the dropdown below to view their detailed loadout (only showing the top 25 by level):';
            } else if (lang === 'ja') {
                placeholder = '詳細配置を表示するキャラクターを選択してください...';
                selectTitle = '👥 キャラクター選択';
                selectDesc = '詳細配置を表示したいキャラクターを下のドロップダウンから選択してください（レベルの高い上位25名のみ表示されます）：';
            }

            // 建立下拉選單
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('char:select')
                .setPlaceholder(placeholder)
                .addOptions(selectOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(selectTitle)
                .setDescription(selectDesc)
                .setTimestamp();

            const response = await interaction.editReply({ embeds: [embed], components: [row] });

            // 建立互動收集器
            const filter = i => i.customId === 'char:select' && i.user.id === interaction.user.id;
            let confirmation;
            try {
                confirmation = await response.awaitMessageComponent({ filter, time: 60000 });
            } catch (e) {
                // 僅捕捉 awaitMessageComponent 逾時的錯誤，避免污染渲染錯誤
                const timeoutTitle = {
                    'zh_Hant': '❌ 操作已逾時',
                    'zh_Hans': '❌ 操作已超时',
                    'en': '❌ Interaction Timeout',
                    'ja': '❌ 操作がタイムアウトしました'
                }[lang] || '❌ 操作已逾時';

                const timeoutDesc = {
                    'zh_Hant': '您未在規定時間內選擇幹員，請重新執行指令。',
                    'zh_Hans': '您未在规定时间内选择干员，请重新执行指令。',
                    'en': 'You did not select a character in time, please run the command again.',
                    'ja': '制限時間内にキャラクターが選択されなかったため、コマンドを再実行してください。'
                }[lang] || '您未在規定時間內選擇幹員，請重新執行指令。';

                const timeoutEmbed = new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle(timeoutTitle)
                    .setDescription(timeoutDesc)
                    .setTimestamp();
                await interaction.editReply({
                    embeds: [timeoutEmbed],
                    components: []
                }).catch(() => {});
                return;
            }
            
            // 點選後立刻進入 defer 狀態，防止 Discord 出現 Interaction Failed 錯誤
            await confirmation.deferUpdate();

            const selectedName = confirmation.values[0];
            const targetChar = chars.find(c => c.charData.name === selectedName);

            if (!targetChar) {
                throw new Error('Target character not found in user data');
            }

            // 開始 Canvas 1:1 渲染
            const buffer = await renderCharacter(targetChar, lang);
            const attachment = new AttachmentBuilder(buffer, { name: 'operator.png' });

            let titleText = `${targetChar.charData.name} 的詳細配置`;
            if (lang === 'en') {
                titleText = `Detailed Loadout of ${targetChar.charData.name}`;
            } else if (lang === 'zh_Hans') {
                titleText = `${targetChar.charData.name} 的详细配置`;
            } else if (lang === 'ja') {
                titleText = `${targetChar.charData.name} の詳細配置`;
            }

            const embedResult = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(titleText)
                .setImage('attachment://operator.png')
                .setTimestamp();

            // 原地編輯訊息，移除下拉選單並附上圖片
            await interaction.editReply({
                embeds: [embedResult],
                files: [attachment],
                components: []
            });

        } catch (error) {
            console.error('[char]', error);
            const embed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle(t(lang, 'error_title'))
                .setDescription(t(lang, 'error_query'))
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
