var request = require('request');
var _ = require('lodash-node');
var send = require('./helpers').send;
var commands = [
    'kick',
    'ban',
    'unban'
];

exports.registerRoutes = function (app, wss) {
    app.get('/', function (req, res) {
        res.send('Down for maintenence');
    });

    app.get('/channels', function (req, res) {
        if (!authenticate(req, res)) return res.status(403).send('Forbidden');

        var channels = _.uniq(wss.getChannels(req.query.channels), 'title');

        res.json(channels);
    });

    app.get('/users', function (req, res) {
        if (!authenticate(req, res))
            return res.status(403).send('Forbidden');

        // This is for creating temp accounts (user joins chat without creating account)
        var client = wss.getClient(req.body),
            user;

        if (client) {
            user = client.user;
        }

        res.json(user);
    });

    app.get('/clientip', function (req, res) {
        if (!authenticate(req, res))
            return res.status(403).send('Forbidden');

        var client = wss.getClient(req.body);

        if (client) return res.json(client.upgradeReq.headers['x-forwarded-for'] || client.upgradeReq.connection.remoteAddress);

        return res.json('Not found', 404);
    });

    app.post('/trigger', function (req, res) {
        if (!authenticate(req, res)) return res.status(403).send('Forbidden');

        var body = req.body;
        var command = parseCommand(body.data.body);
        var channel = wss.getChannel({channel: body.channel});
        var senderClient = wss.getClient({userId: body.sender_id});

        if (!senderClient) return res.status(404).send('Couldn\'t find user');

        var userIsModForThisChannel = senderClient.user.mod_powers.indexOf(channel.channel) > -1;

        if (channel) {
            if (command && (userIsModForThisChannel || senderClient.userId === 1)) {
                execute(command, wss, channel, senderClient);
            } else {
                channel.broadcast(body.event, body.data, senderClient);
            }
        }

        res.send('all good');
    });

    app.post('/notify', function (req, res) {
        if (!authenticate(req, res)) return res.status(403).send('Forbidden');

        var body = req.body,
            userId = typeof body.data.user_id === 'string' ? parseInt(body.data.user_id) : body.data.user_id,
            client = _.find(wss.clients, {userId: userId});

        send(client, req.body.data);

        res.send('good');
    });

    app.post('/command', function (req, res) {
        if (!authenticate(req, res)) return res.status(403).send('Forbidden');
        var client, channel;

        switch (req.body.command) {
            case 'remove-client':
                client = wss.getClient({username: req.body.username});

                if (client) {
                    var message = {event: 'disconnected-forced'};

                    if (req.body.data && req.body.data.reason) {
                        message.reason = req.body.data.reason;
                    }

                    send(client, message);

                    client.close(4000);
                }
                break;
            case 'ban':
                channel = wss.getChannel({channel: req.body.data.channel});
                client = wss.getClient({username: req.body.data.args[0].replace('@', '').trim()});


                if (client) {
                    client.user.bans.push(channel.channel);

                    if (channel) {
                        channel.banMember(client);
                    }
                }
                break;
            case 'unban':
                client = wss.getClient({username: req.body.data.args[0].replace('@', '').trim()});
                if (client) {
                    for (var i = 0; i < client.user.bans.length; i++) {
                        if (client.user.bans[i] === req.body.data.channel) {
                            delete client.user.bans[i];
                        }
                    }

                    send(client, {
                        event: 12,
                        event_info: 'You have been unbanned from #' + req.body.data.channel.substr(4)
                    });
                }
                break;
            case 'kick':
                channel = wss.getChannel({channel: req.body.data.channel});

                if (channel) {
                    client = channel.getMember({username: req.body.data.args[0].replace('@', '').trim()});

                    if (client) {
                        channel.kickMember(client);
                    } else {
                        return res.status(404).send('error');
                    }
                }
                break;
            case 'shadowban':
                client = wss.getClient({username: req.body.data.args[0].replace('@', '').trim()});

                if (client) {
                    client.shadowbanned = true;
                }

                send(client, {
                    event: 'wss_token'
                });

                break;
            case 'disconnect-user':
                client = wss.getClient({username: req.body.data.args[0].replace('@', '').trim()});

                if (client) {
                    try {
                        client.close();
                    } catch (e) {
                        //
                    }
                }

                break;
        }

        res.send('good');
    });

    app.post('/updateChatroomState', function (req, res) {
        if (!authenticate(req, res)) return res.status(403).send('Forbidden');

        var channel = wss.getChannel({channel: req.body.channel});

        if (req.body.property === 'settings') {
            try {
                channel[req.body.property] = JSON.parse(req.body.value);
                channel.broadcast('chatroom-state-change', {
                    settings: channel.settings
                });
            } catch (e) {
                //
            }
        } else {
            channel[req.body.property] = req.body.value;
        }

        return res.send('Good');
    });

    app.post('/updateUserState', function (req, res) {
        if (!authenticate(req, res)) return res.status(403).send('Forbidden');

        var client = wss.getClient({userId: req.body.user_id});

        if (client) {
            client.user[req.body.property] = req.body.value;

            var data = {id: client.user.id};
            data[req.body.property] = req.body.value;

            for (var i = 0; i < client.subscribedChannels.length; i++) {
                client.subscribedChannels[i].broadcast('user-state-change', data);
            }
        }

        return res.send('Good');
    });
};

/**
 *
 * @param req
 * @param res
 * @returns {boolean}
 */
function authenticate(req, res) {
    return req.headers['x-secret-key'] === process.env.APP_SECRET;
}

/**
 * Try to parse command, else return false
 *
 * @param msg
 * @returns obj | bool
 */
function parseCommand(msg) {
    var trimmed = typeof msg === 'string' ? msg.trim(/\s+$/g) : '',
        pattern, regex;

    for (var i = 0; i < commands.length; i++) {
        pattern = '^\\/' + commands[i] + '\\s@?[a-zA-Z0-9-_]+(\\s[a-zA-Z0-9-_]+)?$';
        regex = new RegExp(pattern);

        if (regex.test(trimmed)) {
            var args = trimmed.match(/(?!\s)[a-zA-Z0-9-_]+/g);
            args.shift();

            return {
                command: commands[i],
                args: args
            };
        }
    }

    return false;
}

/**
 * Execute command
 *
 * @param command
 * @param wss
 * @param channel
 * @param moderatorClient
 */
function execute(command, wss, channel, moderatorClient) {
    var subjectUsername = command.args[0];
    var subjectClient = wss.getClient({username: subjectUsername});

    // The user is trying to ban/kick/whatever himself, don't allow.
    if (moderatorClient.username.toLowerCase() === subjectUsername.toLowerCase()
        || (subjectClient && subjectClient.user.mod_powers.indexOf(channel.channel) > -1)) {
        return false;
    }

    if (command.command === 'ban') {
        var formData = {
            bannedUserUsername: subjectUsername, // User to ban
            source_id: moderatorClient.userId, // User who banned other user
            type: 'ban',
            channel: channel.channel,
            secret: process.env.APP_SECRET // This secret will act as a password between servers
        };
        request.post(process.env.AUTH_URL + '/api/rules', {form: formData}, function (error, response, body) {
            if (subjectClient) {
                channel.banMember(subjectClient);
            }

            // Notify mod that it was successful
            send(moderatorClient, {
                event: 'command-success',
                type: 'ban',
                subject: subjectUsername,
                channel: channel.channel
            });
        });
    } else if (command.command === 'unban') {
        subjectClient = wss.getClient({username: subjectUsername});
        // todo send request to php server for unban
        request({
            method: 'DELETE',
            url: process.env.AUTH_URL + '/api/rules/unban',
            qs: {
                // User to ban
                bannedUserUsername: subjectUsername,
                // User who banned other user
                source_id: moderatorClient.userId,
                // Although this is an 'unban' request, the model on the server
                // is stored with 'type' ban, we need to tell the server
                // what the correct type is so it can find and delete it
                type: 'ban',
                channel: channel.channel,
                // This secret will act as a password
                // so that only the ws server can access
                // this endpoint. No one will know...
                secret: process.env.APP_SECRET
            }
        }, function (error, response, body) { // Notify moderator that user was unbanned
            send(moderatorClient, {
                event: 'command-success',
                type: 'unban',
                subject: subjectUsername,
                channel: channel.channel
            });

            if (subjectClient) {
                send(subjectClient, {
                    event: 'unbanned-from-channel',
                    channel: channel.channel
                });
            }
        });
    } else if (command.command === 'kick') {
        if (channel && subjectClient) {
            channel.kickMember(subjectClient);

            send(moderatorClient, {
                event: 'command-success',
                type: 'kick',
                subject: subjectUsername,
                channel: channel.channel
            });
        }
    }
}
