var request = require('request');
var _ = require('lodash-node');
var helpers = require('./helpers.js');
var send = helpers.send;
var wss, sqlz;
var sender = { // To be used for deleted accounts
    id: 0,
    username: 'Guest',
    picture_xs: '/images/avatar-male.jpg'
};
module.exports = {};

/**
 *
 * @param wss_
 * @param sqlz_
 */
module.exports.initialize = function (wss_, sqlz_) {
    wss = wss_;
    sqlz = sqlz_;
};
/**
 * Channel constructor
 *
 * @param channel
 * @param type
 * @constructor
 */
module.exports.Channel = function Channel(channel, type) {
    var suffix, ids;

    this.members = [];
    this.channel = channel;
    this.type = type || 'public';
    this.settings = {};
    this.invites = [];
    var that = this;

    // Set the user ids of the private channel for easy grabbing
    if (this.type === 'private') {
        suffix = channel.substr(4, channel.length);
        ids = suffix.split('_');

        ids[0] = parseInt(ids[0]);
        ids[1] = parseInt(ids[1]);
    }

    getChannelInfo().then(function (query) {
        console.log(query);
    });

    /**
     * Broadcast a message to all members of the channel
     *
     * @param event
     * @param data
     * @param senderClient
     */
    this.broadcast = function (event, data, senderClient) {
        var length = this.members.length,
            i;

        if (!data.sender && senderClient) {
            data.sender = {
                id: senderClient.userId,
                username: senderClient.username,
                picture_xs: senderClient.user.picture_xs,
                mod_powers: senderClient.user.mod_powers
            };
        }

        // Don't send to self if senderClient is present
        if (senderClient) {
            if (senderClient.shadowbanned) {
                for (i = 0; i < length; i++) {
                    // Don't send to the initiator of message if sender was given
                    if (this.members[i].userId !== senderClient.userId && this.members[i].shadowbanned) {
                        send(this.members[i], {
                            event: event,
                            channel: this.channel,
                            data: data,
                            userId: senderClient.userId
                        });
                    }
                }
            } else {
                // Loop through all members
                for (i = 0; i < length; i++) {
                    // Don't send to the initiator of message if sender was given
                    if (this.members[i].userId !== senderClient.userId) {
                        send(this.members[i], {
                            event: event,
                            channel: this.channel,
                            data: data,
                            userId: senderClient.userId
                        });
                    }
                }
            }
        } else {
            for (i = 0; i < length; i++) {
                send(this.members[i], {
                    event: event,
                    channel: this.channel,
                    data: data
                });
            }
        }

        if (event === 'client-message' && this.type === 'private' && senderClient) {
            var otherClient, otherClientId;

            // Find the other user's client object
            if (senderClient.userId !== ids[0]) {
                otherClientId = ids[0];
                otherClient = this.getMember({userId: otherClientId})
            } else {
                otherClientId = ids[1];
                otherClient = this.getMember({userId: otherClientId})
            }

            // If we couldn't find the other user send request
            // to php server to notify (and persist)
            // that user that he received a message
            if (!otherClient) {
                request.post(process.env.AUTH_URL + '/api/websockets/notify', {
                    form: {
                        source_id: senderClient.userId,
                        user_id: otherClientId
                    }
                });
            }
        }
    };
    /**
     * Subscribe/add a WS client to channel's members array
     *
     * @param client
     */
    this.subscribeMember = function (client) {
        var subscribed = _.find(this.members, client);

        if (!subscribed) {
            this.members.push(client);
        }

        addToClientSubscribedChannelsArray(client, this);

        // Notify self that subscription was successful
        send(client, {
            event: 'subscribed',
            channel: that.channel,
            members: that.getScrubbedUserObjects()
        });

        // Notify others that user subscribed
        that.broadcast('member-added', scrubUserInfo(client.user), client);
    };
    /**
     * Unsubscribe/remove client from channel
     *
     * @param client
     */
    this.unsubscribeMember = function (client) {
        _.remove(this.members, client);

        // Notify self that subscription was successful
        send(client, {
            event: 'unsubscribed',
            channel: this.channel
        });

        // Remove this channel from client's subscibed channels array
        _.remove(client.subscribedChannels, {channel: this.channel});

        // Send message to others in channel that user unsubscribed
        this.broadcast('member-removed', client.user);

        destroyChannelIfEmpty(this);
    };
    /**
     * Get client by userId or username
     *
     * @param params
     */
    this.getMember = function (params) {
        var callback;
        if (params.username) {
            var username = params.username.toLowerCase();
            callback = function (member) {
                return member.username.toLowerCase() === username;
            };
        } else {
            callback = function (member) {
                return member.userId === params.userId;
            }
        }

        return _.find(this.members, callback);
    };
    /**
     * Get chatroom info
     *
     * @returns Promise
     */
    this.getInfo = function () {
        return getChannelInfo();
    };
    /**
     *
     * @returns Promise
     */
    this.getInvites = function () {
        return sqlz.models.invite.findAll({
            where: {channel: that.channel}
        });
    };
    /**
     *
     * @param client
     */
    this.banMember = function (client) {
        removeMemberFromChannel(client, this);

        send(client, {
            event: 'banned-from-channel',
            channel: this.channel
        });
    };
    /**
     *
     * @param client
     */
    this.kickMember = function (client) {
        removeMemberFromChannel(client, this);

        send(client, {
            event: 'kicked-from-channel',
            channel: this.channel
        });
    };
    /**
     * For privacy reasons, remove fname, lname, full_name attributes
     * to send to the clients to send to other connected clients.
     *
     * @returns {Array}
     */
    this.getScrubbedUserObjects = function () {
        var scrubbedUsers = [],
            length = this.members.length,
            i;

        for (i = 0; i < length; i++) {
            scrubbedUsers.push(scrubUserInfo(this.members[i].user));
        }

        return scrubbedUsers;
    };

    /**
     *
     * @returns Promise
     */
    function getChannelInfo() {
        return sqlz.models.chatroom.findOne({where: {channel: that.channel}}).then(function (query) {
            try {
                var chatroom = query.dataValues;
                that.settings = JSON.parse(chatroom.settings);
                that.owner_id = chatroom.owner_id;
            } catch (e) {
                //
            }
            that.infoLoaded = true;

            if (that.type === 'protected') {
                that.getInvites().then(function (query) {
                    for (var i = 0; i < query.length; i++) {
                        that.invites.push(query[i].dataValues);
                    }
                    that.invitesLoaded = true;
                });
            }
        });
    }

    return this;
};

/**
 * Remove some user information for privacy reasons
 *
 * @param user
 * @returns {*}
 */
function scrubUserInfo(user) {
    return {
        id: user.id,
        username: user.username,
        picture_xs: user.picture_xs,
        mod_powers: user.mod_powers,
        regularTags: user.regularTags
    };
}

/**
 *
 * @param client
 * @param channel
 */
function removeMemberFromChannel(client, channel) {
    var count = 0;

    do {
        count = _.remove(this.members, {userId: client.userId}).length;
    } while (count);

    // Remove this channel from client's subscibed channels array
    var t = _.remove(client.subscribedChannels, {channel: channel.channel});

    destroyChannelIfEmpty(channel);
}

/**
 * Each client has an array which contains all subscribed channels.
 * When client subscribes to a channel, add channel to array.
 *
 * @param client
 * @param Channel
 */
function addToClientSubscribedChannelsArray(client, Channel) {
    var index = client.subscribedChannels.map(function (channel) {
        return channel.channel;
    }).indexOf(Channel.channel);

    if (index === -1) {
        client.subscribedChannels.push(Channel);
    }
}

/**
 * If channel has no more members, remove it from wss array.
 *
 * @param channel
 */
function destroyChannelIfEmpty(channel) {
    if (channel && (channel.members && channel.members.length === 0 || !channel.members)) {
        _.remove(wss.channels, {channel: channel.channel});
    }
}

/**
 * Extract messages from query
 *
 * @param query
 * @returns {Array}
 */
function extractMessages(query) {
    var messages = [];
    var message;

    // Loop through each message
    for (var i = 0; i < query.length; i++) {
        message = query[i].dataValues || null;

        if (message.user) {
            message.sender = message.user.dataValues;
        } else {
            message.sender = { // To be used for deleted accounts
                id: 0,
                username: 'Guest',
                picture_xs: '/images/avatar-male.jpg'
            };
        }

        message.sender.mod_powers = [];

        if (message.sender && message.sender.moderators) {
            for (var i2 = 0; i2 < message.sender.moderators.length; i2++) {
                message.sender.mod_powers.push(message.sender.moderators[i2].dataValues.channel);
            }
        }

        if (message.photo) {
            message.photo = {url: process.env.RACKSPACE_URL + message.photo.dataValues.uri};
        }

        delete message.sender.moderators;
        delete message.user;

        messages.unshift(message);
    }

    return messages;
}
