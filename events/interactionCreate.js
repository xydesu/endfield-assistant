const { Events } = require('discord.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Handle Chat Input Commands
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '執行此指令時發生錯誤！', ephemeral: true });
                } else {
                    await interaction.reply({ content: '執行此指令時發生錯誤！', ephemeral: true });
                }
            }
            return;
        }

        // Handle Buttons, Modals & Select Menus
        // CustomId convention: "commandName:action"
        if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
            const [commandName, action] = interaction.customId.split(':');
            const command = interaction.client.commands.get(commandName);

            if (!command) {
                console.error(`No command found for customId: ${interaction.customId}`);
                return;
            }

            try {
                if (interaction.isButton() && command.handleButton) {
                    await command.handleButton(interaction, action);
                } else if (interaction.isModalSubmit() && command.handleModal) {
                    await command.handleModal(interaction, action);
                } else if (interaction.isStringSelectMenu() && command.handleSelectMenu) {
                    await command.handleSelectMenu(interaction, action);
                }
            } catch (error) {
                console.error(error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '處理操作時發生錯誤！', ephemeral: true });
                } else {
                    await interaction.reply({ content: '處理操作時發生錯誤！', ephemeral: true });
                }
            }
        }
    },
};
