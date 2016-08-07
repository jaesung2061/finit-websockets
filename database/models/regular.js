module.exports.define = function (sqlz, Sequelize) {
    return sqlz.define('regular', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        user_id: {
            type: Sequelize.INTEGER
        },
        channel: {
            type: Sequelize.STRING
        }
    });
};