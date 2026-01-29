const Sequelize = require('sequelize');
const sequelize = require('../database/db');

const Server = sequelize.define('server', {
    guildId: {
        type: Sequelize.STRING,
        unique: true,
        primaryKey: true,
    },
    notifyChannelId: {
        type: Sequelize.STRING,
        allowNull: true,
    },
});

module.exports = Server;
