require('dotenv').load();

var WebSocketServer = require('ws').Server;
var request = require('request');
var _ = require('lodash-node');
var url = require('url');
var validator = require('validator');
var jwt = require('jsonwebtoken');
var wss;

var helpers = require('./helpers.js');
var sqlz = require('./database/init.js');
var Channel = require('./channel.js').Channel;
var send = helpers.send;
var tryCatch = helpers.tryCatch;

exports.initialize = function (http) {
    wss = new WebSocketServer({server: http});
    wss.channels = [];

    initiateThrottleClearing();

    wss.on('connection', onWSSConnection);

    /**
     * Broadcast a message to every connected client on the WSS server.
     *
     * @param data
     * @param excludeId
     * @returns {WebSocketServer}
     */
    wss.broadcast = function (data, excludeId) {
        data = JSON.stringify(data);

        wss.clients.forEach(function each(client) {
            try {
                if (!excludeId) {
                    client.send(data);
                } else if (client.userId !== excludeId) {
                    client.send(data);
                }
            } catch (e) {
            }
        });

        return wss;
    };
    /**
     * Add channel to array
     *
     * @param channel
     */
    wss.addChannel = function (channel) {
        if (!_.find(wss.channels, {channel: channel.channel})) {
            wss.channels.push(channel);
        }
    };
    /**
     * Get channel on WSS object.
     *
     * @param params
     */
    wss.getChannel = function (params) {
        return _.find(wss.channels, params);
    };
    /**
     * Get multiple channels
     *
     * @param channelsToGet
     * @returns {Array}
     */
    wss.getChannels = function (channelsToGet) {
        var channels = [],
            length, channel, i;

        if (channelsToGet && channelsToGet.length > 0) {
            length = channelsToGet.length;

            for (i = 0; i < length; i++) {
                channel = wss.getChannel({channel: channelsToGet[i]});

                if (channel && channel.type === 'public') {
                    channels.push({
                        title: channel.channel.substr(4, channel.channel.length),
                        member_count: channel.members.length
                    });
                }
            }
        } else {
            // Get all active channels
            length = wss.channels.length;

            for (i = 0; i < length; i++) {
                channel = wss.channels[i];

                // Only public channels
                if (channel.type === 'public') {
                    channels.push({
                        title: channel.channel.substr(4, channel.channel.length),
                        member_count: channel.members.length
                    });
                }
            }
        }

        return channels;
    };
    /**
     * Unsubscribe user
     *
     * @param channelName
     * @param username
     * @returns {WebSocketServer}
     */
    wss.banFromChannel = function (channelName, username) {
        var channel = _.find(wss.channels, {channel: channelName}),
            client;

        if (channel)
            for (var i = 0; i < channel.members.length; i++) {
                if (channel.members[i].user.username === username) {
                    client = channel.members[i];
                    channel.broadcast('member-removed', client, {user: client.user});

                    _.remove(channel.members, client);
                    break;
                }
            }

        return wss;
    };
    /**
     *
     * @param client
     * @param friendIds
     * @returns {WebSocketServer}
     */
    wss.getOnlineFriends = function (client, friendIds) {
        var clientsLength = wss.clients.length,
            friendIdsLength = friendIds.length,
            returnArray = [],
            friendsIndex, clientsIndex;

        // Loop through friends
        for (friendsIndex = 0; friendsIndex < friendIdsLength; friendsIndex++) {
            // Loop through clients
            for (clientsIndex = 0; clientsIndex < clientsLength; clientsIndex++) {
                // If clientId === friendId
                if (wss.clients[clientsIndex].userId === friendIds[friendsIndex]) {
                    returnArray.push(wss.clients[clientsIndex].userId);
                }
            }
        }

        send(client, {
            event: 'online-friends',
            friendIds: returnArray
        });

        return wss;
    };
    /**
     *
     * @param client
     * @param friendIds
     * @returns {WebSocketServer}
     */
    wss.notifyOnlineFriends = function (client, friendIds) {
        var clientsLength = wss.clients.length,
            friendIdsLength = friendIds.length,
            friendsIndex, clientsIndex;

        // Loop through friends
        for (friendsIndex = 0; friendsIndex < friendIdsLength; friendsIndex++) {
            // Loop through clients
            for (clientsIndex = 0; clientsIndex < clientsLength; clientsIndex++) {
                // If clientId === friendId
                if (wss.clients[clientsIndex].userId === friendIds[friendsIndex]) {
                    send(wss.clients[clientsIndex], {
                        event: 'client-connected',
                        userId: client.user.id
                    });
                }
            }
        }

        return wss;
    };
    /**
     *
     * @param params
     * @returns {*}
     */
    wss.getClient = function (params) {
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

        return _.find(wss.clients, callback);
    };

    return wss;
};
/**
 * When new client initiates connection
 *
 * @param client
 */
function onWSSConnection(client) {
    var reqOptions = url.parse(client.upgradeReq.url, true).query;

    // AUTHENTICATE USER
    jwt.verify(reqOptions.token, process.env.JWT_SECRET, {
        ignoreExpiration: true,
        ignoreNotBefore: true
    }, function (err, decoded) {
        if (err) return client.close();

        sqlz.models.user.findOne({
            where: {id: decoded.sub},
            include: [
                {model: sqlz.models.rule, attributes: ['channel']},
                {model: sqlz.models.moderator, attributes: ['channel']},
                {model: sqlz.models.regular, attributes: ['channel']}
            ]
        }).then(function (query) {
            if (!query) return client.close();

            var user = query.dataValues;
            user.bans = extractBans(query);
            user.mod_powers = extractModPowers(query);
            user.regularTags = extractRegularTags(query);

            delete user.moderators;
            delete user.regulars;
            delete user.rules;

            client.userId = user.id;
            client.username = user.username;
            client.user = user;
            client.subscribedChannels = [];
            client.throttleCount = 0;

            client.on('message', function (event) {
                tryCatch(function () {
                    event = JSON.parse(event);

                    switch (event.event) {
                        case 'subscribe':
                            return handleSubscription(event, client);
                        case 'unsubscribe':
                            return handleUnsubscription(event, client);
                        case 'presence-request':
                            return handlePresenceRequest(event, client);
                        case 'client-message':
                            return handleClientChatMessage(event, client);
                        case 'refresh-members':
                            return handleRefreshMembersRequest(event, client);
                    }
                });
            });

            client.on('close', function () {
                while (client.subscribedChannels.length > 0) {
                    client.subscribedChannels[0].unsubscribeMember(client);
                }

                // To update online friend list (on client side)
                wss.broadcast({
                    event: 'client-disconnected',
                    userId: user.id
                });

                client = null;
            });

            send(client, {event: 'connected'});
        });
    });
}
/**
 * When client sends subscribe to channel request
 *
 * @param event
 * @param client
 * @returns {*}
 */
function handleSubscription(event, client) {
    var prefix = event.channel.substr(0, 4);
    var suffix = event.channel.substr(4, event.channel.length);
    var channel, ids;

    if (prefix === 'pub_') {
        event.channel = event.channel.substr(0, 34);

        if (event.channel === 'cp') {
            return send(client, {
                event: 'subscription-failure',
                channel: event.channel,
                reason: 'invalid-input'
            });
        }

        if (!validator.isAlphanumeric(suffix)) {
            return send(client, {
                event: 'subscription-failure',
                channel: event.channel,
                reason: 'invalid-input'
            });
        }

        // No ban rules found
        if (client.user.bans.indexOf(event.channel) === -1) {
            channel = getChannelOrCreate(event);
            channel.subscribeMember(client);
            wss.addChannel(channel);
        } else {
            send(client, {
                event: 'subscription-failure',
                channel: event.channel,
                reason: 'banned'
            });
        }
    } else if (prefix === 'prv_') {
        ids = suffix.split('_');

        // Validate that channel is in correct format
        if (!/^[0-9]+_[0-9]+$/.test(suffix)) {
            return send(client, {
                event: 'subscription-failure',
                channel: event.channel,
                reason: 'invalid-input'
            });
        }

        // The channel must have current user id in it.
        // This prevents random users from joining
        // private chats of another two users.
        if (parseInt(ids[0]) !== client.userId && parseInt(ids[1]) !== client.userId) {
            return send(client, {
                event: 'subscription-failure',
                channel: event.channel,
                reason: 'forbidden'
            });
        }

        channel = getChannelOrCreate(event, 'private');
        channel.subscribeMember(client);
        wss.addChannel(channel);
    } else if (prefix === 'pro_') {
        channel = getChannelOrCreate(event, 'protected');

        // check if user is authorized
        if (!channel.infoLoaded) {
            sqlz.models.chatroom.findOne({where: {channel: channel.channel}}).then(function (query) {
                subscribeIfAuthorized();
            });
        } else {
            subscribeIfAuthorized();
        }
    }

    function subscribeIfAuthorized() {
        if (client.user.id === channel.owner_id || (channel.settings && channel.settings.auth && channel.settings.auth.anyone)) {
            channel.subscribeMember(client);
            wss.addChannel(channel);
            return;
        }

        if (channel.invitesLoaded) {
            subscribeOrFail();
        } else {
            sqlz.models.invite.findAll({where: {channel: channel.channel}}).then(function (query) {
                for (var i = 0; i < query.length; i++) {
                    channel.invites.push(query[i].dataValues);
                }
                channel.invitesLoaded = true;

                subscribeOrFail();
            });
        }

        function subscribeOrFail() {
            if (_.find(channel.invites, {accepter_id: client.user.id})) {
                channel.subscribeMember(client);
                wss.addChannel(channel);
            } else {
                send(client, {
                    event: 'subscription-failure',
                    channel: event.channel,
                    reason: 'forbidden'
                });
            }
        }
    }
}
/**
 * When client sends unsubscribe from channel request
 *
 * @param event
 * @param client
 */
function handleUnsubscription(event, client) {
    var channel = wss.getChannel({channel: event.channel});

    if (channel) {
        channel.unsubscribeMember(client);

        if (channel.members.length === 0) {
            _.remove(wss.channels, channel);
            channel = null;
        }
    }
}
/**
 * When client sends presence request
 *
 * @param event
 * @param client
 */
function handlePresenceRequest(event, client) {
    if (event.friendIds) {
        wss.getOnlineFriends(client, event.friendIds);
        wss.notifyOnlineFriends(client, event.friendIds);
    }
}
/**
 * When client sends message for chat
 *
 * @param event
 * @param client
 */
function handleClientChatMessage(event, client) {
    if (!throttleClears(client)) {
        return;
    }

    if (!!event.data.wss_token === true) {
        client.shadowbanned = true;
    }

    event.data.body = event.data.body.substr(0, 255);

    var channel = wss.getChannel({channel: event.channel});

    if (channel.settings && channel.settings.mode && client.userId !== 1) {
        switch (channel.settings.mode) {
            case 'regulars':
                if (client.user.mod_powers.indexOf(channel.channel) === -1 && client.user.regularTags.indexOf(channel.channel) === -1)
                    return send(client, {
                        event: 'restricted',
                        message: 'Only users tagged as regulars can send messages here at this moment.'
                    });
                break;
            case 'mods':
                if (client.user.mod_powers.indexOf(channel.channel) === -1)
                    return send(client, {
                        event: 'restricted',
                        message: 'Only mods can send messages here at this moment.'
                    });
                break;
            case 'registered':
                if (client.user.is_temp)
                    return send(client, {
                        event: 'restricted',
                        message: 'Only registered accounts can send messages here at this moment.'
                    });
                break;
        }
    }

    if (client.user.bans.indexOf(event.channel) === -1 && _.find(client.subscribedChannels, {channel: channel.channel})) {
        var date = new Date();
        if (!client.shadowbanned) {
            request.post(process.env.AUTH_URL + '/api/messages', {
                form: {
                    body: event.data.body,
                    sender_id: client.userId,
                    channel: event.data.channel,
                    created_at: date,
                    updated_at: date,
                    secret: process.env.APP_SECRET
                }
            }, function (error, response, body) {
                //console.log(error);
                //if (response.statusCode >= 400) {
                //    todo remove sent message
                //}
            });
        }

        channel.broadcast('client-message', event.data, client);
    }
}
/**
 * When user requests new member list.
 * @param event
 * @param client
 */
function handleRefreshMembersRequest(event, client) {
    var channel = wss.getChannel({channel: event.channel});

    send(client, {
        event: 'refreshed-members',
        members: channel.getScrubbedUserObjects(),
        channel: channel.channel
    });
}
/**
 * See if channel exists, if not, create one
 *
 * @param event
 * @param type
 */
function getChannelOrCreate(event, type) {
    var channel = wss.getChannel({channel: event.channel});

    if (!channel) {
        channel = new Channel(event.channel, type);
    }

    return channel;
}
/**
 *
 * @param query
 */
function extractBans(query) {
    var extracted = [];
    var length = query.dataValues.rules.length;

    for (var i = 0; i < length; i++) {
        if (query.dataValues.rules[i].dataValues.type === 'ban')
            extracted.push(query.dataValues.rules[i].dataValues.channel);
    }

    return extracted;
}
/**
 *
 * @param query
 */
function extractModPowers(query) {
    var extracted = [];
    var length = query.dataValues.moderators.length;

    for (var i = 0; i < length; i++) {
        extracted.push(query.dataValues.moderators[i].dataValues.channel);
    }

    return extracted;
}
/**
 *
 * @param query
 */
function extractRegularTags(query) {
    var extracted = [];
    var length = query.dataValues.regulars.length;

    for (var i = 0; i < length; i++) {
        extracted.push(query.dataValues.regulars[i].dataValues.channel);
    }

    return extracted;
}

/**
 * Throttle client messages
 *
 * @returns {boolean} False when the client has sent too many messages within the last second
 */
function throttleClears(client) {
    if (client.throttled) {
        send(client, {
            event: 'excessive-messaging'
        });

        return false;
    }

    if (client.throttleCount >= 3) {
        client.throttled = new Date();
        send(client, {
            event: 'excessive-messaging'
        });

        return false;
    }

    client.throttleCount++;

    return true;
}
/**
 * Clear throttle
 */
function initiateThrottleClearing() {
    // Clear messages count for previous second
    setInterval(function () {
        var length = wss.clients.length;
        for (var i = 0; i < length; i++) {
            wss.clients[i].throttleCount = 0;
        }
    }, 1000);

    // Clear throttled clients that have been throttled for 1 minute
    setInterval(function () {
        var length = wss.clients.length;
        for (var i = 0; i < length; i++) {
            if (wss.clients[i].throttled && new Date().getTime() - wss.clients[i].throttled > 60000) {
                delete wss.clients[i].throttled;
            }
        }
    }, 1000);
}
