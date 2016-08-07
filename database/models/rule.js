module.exports.define = function (sqlz, Sequelize) {
    return sqlz.define('rule', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        user_id: {
            type: Sequelize.INTEGER
        },
        source_id: {
            type: Sequelize.INTEGER
        },
        type: {
            type: Sequelize.STRING
        },
        channel: {
            type: Sequelize.STRING
        }
    });
};