require('dotenv').load();
require('colors');

var http = require('http');
var https = require('https');
var app = require('express')();
var router = require('./router.js');
var websockets = require('./websockets.js');
var bodyParser = require('body-parser');
var fs = require('fs');
var Channel = require('./channel.js');
var sqlz = require('./database/init.js');
var port = process.env.APP_PORT;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

if (process.env.APP_ENV === 'production') {
    https = https.createServer({
        key: fs.readFileSync(process.env.SSL_KEY),
        cert: fs.readFileSync(process.env.SSL_CERT)
    }).listen(port, function () {
        console.log(('ssl Listening on ' + port).blue);
    });
    https.on('request', app);

    wss = websockets.initialize(https);
    Channel.initialize(wss, sqlz);
} else {
    http = http.createServer().listen(port, function () {
        console.log(('Listening on ' + port).blue);
    });
    http.on('request', app);

    wss = websockets.initialize(http);
    Channel.initialize(wss, sqlz);
}

router.registerRoutes(app, wss);