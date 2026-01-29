const Sequelize = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    logging: false,
    storage: path.join(__dirname, 'database.sqlite'),
});

module.exports = sequelize;
