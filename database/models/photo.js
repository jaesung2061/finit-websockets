module.exports.define = function (sqlz, Sequelize) {
    return sqlz.define('photo', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        user_id: {
            type: Sequelize.INTEGER.UNSIGNED
        },
        box_id: {
            type: Sequelize.INTEGER.UNSIGNED
        },
        message_id: {
            type: Sequelize.INTEGER.UNSIGNED
        },
        uri: {
            type: Sequelize.STRING
        }
    });
};