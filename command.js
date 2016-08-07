module.exports = function Command(msg) {
    var commands = ['timeout', 'ban', 'unban'],
        trimmed = typeof msg === 'string' ? msg.trim(/\s+$/g) : '',
        regex;

    for (var i = 0; i < commands.length; i++) {
        regex = new RegExp('^\\/' + commands[i] + '\\s@?[a-zA-Z0-9]+(\\s[a-zA-Z0-9]+)?$');

        if (regex.test(trimmed)) {
            var args = trimmed.match(/(?:\b)[a-zA-Z0-9]+/g);
            args.shift();

            this.command = commands[i];
            this.args = args;

            return this;
        }
    }
};

Command.prototype.execute = function execute(wss, channelName, sender_id) {
    var command = this,
        moderator = wss.getClient({userId: sender_id}),
        client;

    switch (command.command) {
        case 'ban':
            // The idiot is trying to ban himself, don't allow.
            if (moderator.username === command.args[0]) return;

            client = wss.getClient({username: command.args[0]});

            if (client) {
                try {
                    wss.banFromChannel(channelName, command.args[0]);
                    client.send(JSON.stringify({
                        event: 'client-banned',
                        user_id: client.userId,
                        channel: channelName
                    }));
                } catch (e) {
                    console.log(e.toString().red);
                }
            }

            request.post(process.env.AUTH_URL + '/api/rules', {
                form: {
                    // User to ban
                    bannedUserUsername: command.args[0],
                    // User who banned other user
                    source_id: sender_id,
                    type: 'ban',
                    channel: channelName,
                    // This secret will act as a password
                    // so that only the ws server can access
                    // this endpoint. No one will know...
                    secret: process.env.APP_SECRET
                }
            }, function (error, response, body) {
                //
            });
            break;
        case 'unban':
            client = wss.getClient({username: command.args[0]});
            // todo send request to php server for unban
            request({
                method: 'DELETE',
                url: process.env.AUTH_URL + '/api/rules',
                qs: {
                    // User to ban
                    bannedUserUsername: command.args[0],
                    // User who banned other user
                    source_id: sender_id,
                    // Although this is an 'unban' request, the model on the server
                    // is stored with 'type' ban, we need to tell the server
                    // what the correct type is so it can find and delete it
                    type: 'ban',
                    channel: channelName,
                    // This secret will act as a password
                    // so that only the ws server can access
                    // this endpoint. No one will know...
                    secret: process.env.APP_SECRET
                }
            }, function (error, response, body) {
                //
            });

            if (client) {
                // todo notify client
            }

            break;
        case 'timeout':
            //
            break;
    }
};