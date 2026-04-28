const { Sequelize } = require('sequelize');
const path = require('path');

const requestedDialect = (process.env.DB_DIALECT || 'sqlite').toLowerCase();
const isMongo = requestedDialect === 'mongodb' || requestedDialect === 'mongo';
const sequelizeDialects = new Set(['sqlite', 'mysql', 'mariadb', 'postgres', 'mssql']);

let dialect = requestedDialect;
let sequelize = null;
let mongoose = null;
let mongoConnectionPromise = null;

if (isMongo) {
    dialect = 'mongodb';
    const mongoUri = process.env.MONGODB_URI || process.env.DB_URI || 'mongodb://127.0.0.1:27017/endfield_assistant';

    try {
        mongoose = require('mongoose');
    } catch (error) {
        throw new Error('MongoDB mode requires "mongoose". Run "npm install" to install dependencies.');
    }

    mongoose.set('strictQuery', true);
    mongoConnectionPromise = mongoose.connect(mongoUri);
} else {
    if (!sequelizeDialects.has(dialect)) {
        console.warn(`[Database] Unsupported DB_DIALECT "${requestedDialect}". Falling back to sqlite.`);
        dialect = 'sqlite';
    }

    if (dialect === 'sqlite') {
        sequelize = new Sequelize({
            dialect,
            logging: false,
            storage: process.env.SQLITE_STORAGE || path.join(__dirname, 'database.sqlite'),
        });
    } else if (process.env.DB_URI) {
        sequelize = new Sequelize(process.env.DB_URI, {
            dialect,
            logging: false,
        });
    } else {
        sequelize = new Sequelize({
            dialect,
            logging: false,
            host: process.env.DB_HOST || '127.0.0.1',
            port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
            database: process.env.DB_NAME || 'endfield_assistant',
            username: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
        });
    }
}

module.exports = {
    dialect,
    isMongo,
    sequelize,
    mongoose,
    mongoConnectionPromise,
};
