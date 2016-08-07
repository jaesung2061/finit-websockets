module.exports.define = function (sqlz, Sequelize) {
    return sqlz.define('message', {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true
        },
        user_id: {
            type: Sequelize.INTEGER.UNSIGNED,
            field: 'sender_id'
        },
        photo_id: {
            type: Sequelize.INTEGER.UNSIGNED
        },
        channel: {
            type: Sequelize.STRING
        },
        body: {
            type: Sequelize.STRING
        }
    }, {
        tableName: 'chat_messages'
    });
};