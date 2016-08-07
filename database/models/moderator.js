module.exports.define = function (sqlz, Sequelize) {
    return sqlz.define('moderator', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        user_id: {
            type: Sequelize.INTEGER
        },
        channel: {
            type: Sequelize.STRING
        },
        approved: {
            type: Sequelize.INTEGER
        }
    });
};