const Sequelize = require('sequelize');
const sequelize = require('../database/db');

const User = sequelize.define('users', {
    discordId: {
        type: Sequelize.STRING,
        unique: true,
        primaryKey: true,
    },
    cred: {
        type: Sequelize.TEXT,
        allowNull: false,
    },
    uid: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    serverId: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    autoSignTime: {
        type: Sequelize.STRING, // Format: "HH:mm"
        defaultValue: null,
    },
    lastSignDate: {
        type: Sequelize.STRING, // Format: "YYYY-MM-DD"
        defaultValue: null,
    },
    isTag: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
    },
    isStaminaTag: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
    },
    notifyGuildId: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    staminaNotify: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
    },
    staminaThreshold: {
        type: Sequelize.INTEGER, // Percentage (1–99) of maxStamina to trigger notification
        defaultValue: 80,
    },
    staminaNotified: {
        type: Sequelize.BOOLEAN, // True once notified; reset when stamina drops back below threshold
        defaultValue: false,
    },
    language: {
        type: Sequelize.STRING,
        defaultValue: 'zh_Hant', // zh_Hant | zh_Hans | ja | en
    },
    dailyNotify: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
    },
    dailyNotifyTime: {
        type: Sequelize.STRING, // Format: "HH:mm" (UTC)
        defaultValue: null,
    },
    isDailyTag: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
    },
    dailyNotified: {
        type: Sequelize.BOOLEAN, // True once notified for the current daily cycle; reset at server daily reset time
        defaultValue: false,
    },
});

module.exports = User;
