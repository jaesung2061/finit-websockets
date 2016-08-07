var Sequelize = require('sequelize');

var sqlz = new Sequelize(
    process.env.DB_DATABASE,
    process.env.DB_USERNAME,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        pool: {
            max: 5,
            min: 0,
            idle: 10000
        },
        define: {
            underscored: true
        },
        logging: false
    }
);

var User = require('./models/user.js').define(sqlz, Sequelize);
var Chatroom = require('./models/chatroom.js').define(sqlz, Sequelize);
var Message = require('./models/message.js').define(sqlz, Sequelize);
var Moderator = require('./models/moderator.js').define(sqlz, Sequelize);
var Rule = require('./models/rule.js').define(sqlz, Sequelize);
var Regular = require('./models/regular.js').define(sqlz, Sequelize);
var Photo = require('./models/photo.js').define(sqlz, Sequelize);
var Invite = require('./models/invite.js').define(sqlz, Sequelize);

User.hasMany(Moderator, {name: 'user_id'});
User.hasMany(Rule, {name: 'user_id'});
User.hasMany(Regular, {name: 'user_id'});

Message.hasOne(Photo);
Message.belongsTo(User);

module.exports = sqlz;