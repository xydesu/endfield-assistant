const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);

        try {
            const User = require('../models/User');
            const Server = require('../models/Server');
            const scheduler = require('../utils/scheduler');

            await User.sync({ alter: true });
            await Server.sync({ alter: true });
            console.log('Database synced');

            await scheduler.initScheduler(client);
        } catch (error) {
            console.error('Failed to initialize:', error);
        }
    },
};
