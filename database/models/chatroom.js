module.exports.define = function (sqlz, Sequelize) {
    return sqlz.define('chatroom', {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true
        },
        owner_id: {
            type: Sequelize.INTEGER.UNSIGNED
        },
        channel: {
            type: Sequelize.STRING
        },
        image: {
            type: Sequelize.STRING
        },
        tab_title: {
            type: Sequelize.STRING
        },
        description_short: {
            type: Sequelize.STRING
        },
        settings: {
            type: Sequelize.STRING
        },
        title: {
            type: Sequelize.STRING
        }
    });
};