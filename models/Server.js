const Sequelize = require('sequelize');
const { sequelize, mongoose, isMongo, mongoConnectionPromise } = require('../database/db');

if (!isMongo) {
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
} else {
    const ServerSchema = new mongoose.Schema({
        guildId: { type: String, unique: true, required: true },
        notifyChannelId: { type: String, default: null },
    }, {
        versionKey: false,
    });

    ServerSchema.methods.update = async function update(values) {
        Object.assign(this, values);
        await this.save();
        return this;
    };

    ServerSchema.methods.destroy = async function destroy() {
        await this.deleteOne();
    };

    ServerSchema.statics.findByPk = async function findByPk(guildId) {
        return this.findOne({ guildId });
    };

    ServerSchema.statics.findAll = async function findAll(options = {}) {
        return this.find(options.where || {});
    };

    ServerSchema.statics.upsert = async function upsert(values) {
        return this.findOneAndUpdate(
            { guildId: values.guildId },
            { $set: values },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    };

    ServerSchema.statics.update = async function update(values, options = {}) {
        const where = options.where || {};
        const result = await this.updateMany(where, { $set: values });
        return [result.modifiedCount];
    };

    ServerSchema.statics.sync = async function sync() {
        await mongoConnectionPromise;
        await this.init();
    };

    const Server = mongoose.models.Server || mongoose.model('Server', ServerSchema, 'servers');
    module.exports = Server;
}
