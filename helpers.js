module.exports = {
    /**
     * Make a copy of object
     *
     * @param obj
     * @returns {*}
     */
    clone: function (obj) {
        var copy;

        // Handle the 3 simple types, and null or undefined
        if (null == obj || "object" != typeof obj) return obj;

        // Handle Date
        if (obj instanceof Date) {
            copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        // Handle Array
        if (obj instanceof Array) {
            copy = [];
            for (var i = 0, len = obj.length; i < len; i++) {
                copy[i] = this.clone(obj[i]);
            }
            return copy;
        }

        // Handle Object
        if (obj instanceof Object) {
            copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = this.clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    },
    /**
     * Send to client in a try/catch block
     *
     * @param client
     * @param value
     * @param errorHandler
     */
    send: function send(client, value, errorHandler) {
        try {
            client.send(JSON.stringify(value));
        } catch (e) {
            if (errorHandler)
                errorHandler(e);
        }
    },
    /**
     * Wrapper to reduce lines of code on try/catch blocks.
     * I hate seeing empty catch blocks so... Out of sight,
     * out of mind.
     *
     * @param tryFunc
     * @param catchFunc
     */
    tryCatch: function (tryFunc, catchFunc) {
        try {
            tryFunc();
        } catch (e) {
            if (catchFunc)
                catchFunc(e);
        }
    }
};
