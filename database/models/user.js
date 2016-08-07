module.exports.define = function (sqlz, Sequelize) {
    return sqlz.define('user', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true
        },
        username: {
            type: Sequelize.STRING
        },
        website: {
            type: Sequelize.STRING
        },
        bio: {
            type: Sequelize.STRING
        },
        picture_lg: {
            type: Sequelize.STRING
        },
        picture_md: {
            type: Sequelize.STRING
        },
        picture_sm: {
            type: Sequelize.STRING
        },
        picture_xs: {
            type: Sequelize.STRING
        },
        is_temp: {
            type: Sequelize.BOOLEAN
        },
        is_private: {
            type: Sequelize.BOOLEAN
        },
        settings: {
            type: Sequelize.STRING
        }
    });
};