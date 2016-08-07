var crypto = require('crypto');
var algorithm = 'aes-256-ctr';
var password = process.env.APP_SECRET;

module.exports = {
    /**
     *
     * @param text
     * @returns {*}
     */
    encrypt: function (text) {
        var cipher = crypto.createCipher(algorithm, password);
        var crypted = cipher.update(text, 'utf8', 'hex');
        crypted += cipher.final('hex');
        return crypted;
    },
    /**
     *
     * @param text
     * @returns {*}
     */
    decrypt: function (text) {
        var decipher = crypto.createDecipher(algorithm, password);
        var dec = decipher.update(text, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    }
};