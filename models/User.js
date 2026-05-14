const Sequelize = require('sequelize');
const { sequelize, mongoose, isMongo, mongoConnectionPromise } = require('../database/db');

if (!isMongo) {
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
            type: Sequelize.INTEGER, // Percentage (1-99) of maxStamina to trigger notification
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
} else {
    const UserSchema = new mongoose.Schema({
        discordId: { type: String, unique: true, required: true },
        cred: { type: String, required: true },
        uid: { type: String, required: true },
        serverId: { type: String, required: true },
        autoSignTime: { type: String, default: null },
        lastSignDate: { type: String, default: null },
        isTag: { type: Boolean, default: true },
        isStaminaTag: { type: Boolean, default: true },
        notifyGuildId: { type: String, default: null },
        staminaNotify: { type: Boolean, default: false },
        staminaThreshold: { type: Number, default: 80 },
        staminaNotified: { type: Boolean, default: false },
        language: { type: String, default: 'zh_Hant' },
        dailyNotify: { type: Boolean, default: false },
        dailyNotifyTime: { type: String, default: null },
        isDailyTag: { type: Boolean, default: true },
        dailyNotified: { type: Boolean, default: false },
    }, {
        versionKey: false,
    });

    UserSchema.methods.update = async function update(values) {
        Object.assign(this, values);
        await this.save();
        return this;
    };

    UserSchema.methods.destroy = async function destroy() {
        await this.deleteOne();
    };

    UserSchema.statics.findByPk = async function findByPk(discordId) {
        return this.findOne({ discordId });
    };

    UserSchema.statics.findAll = async function findAll(options = {}) {
        return this.find(options.where || {});
    };

    UserSchema.statics.upsert = async function upsert(values) {
        return this.findOneAndUpdate(
            { discordId: values.discordId },
            { $set: values },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    };

    UserSchema.statics.update = async function update(values, options = {}) {
        const where = options.where || {};
        const result = await this.updateMany(where, { $set: values });
        return [result.modifiedCount];
    };

    UserSchema.statics.sync = async function sync() {
        await mongoConnectionPromise;
        await this.init();
    };

    const User = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
    module.exports = User;
}
