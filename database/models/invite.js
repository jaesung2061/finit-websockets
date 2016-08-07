module.exports.define = function (sqlz, Sequelize) {
    return sqlz.define('invite', {
        id: {
            type: Sequelize.INTEGER.UNSIGNED,
            primaryKey: true
        },
        requester_id: {
            type: Sequelize.INTEGER.UNSIGNED
        },
        accepter_id: {
            type: Sequelize.INTEGER.UNSIGNED
        },
        channel: {
            type: Sequelize.STRING
        }
    });
};