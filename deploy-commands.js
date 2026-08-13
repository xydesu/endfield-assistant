const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

const rest = new REST().setToken(process.env.DISCORD_AUTH || process.env.DISCORD_TOKEN);

(async () => {
    try {
        if (!process.env.CLIENT_ID) {
            console.error('Error: CLIENT_ID is missing in .env');
            process.exit(1);
        }
        console.warn(`Started refreshing ${commands.length} application (/) commands.`);

        let data;
        if (process.env.GUILD_ID) {
            console.warn(`Deploying to Guild: ${process.env.GUILD_ID}`);
            data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands },
            );
        } else {
            console.warn('Deploying Globally (GUILD_ID not found in .env)');
            data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands },
            );
        }

        console.warn(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
