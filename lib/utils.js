const crypto = require('crypto');

// max bytes size for key, memcached limit 250 bytes.
const MAX_KEY_SIZE = 250;

function md5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

// http://stackoverflow.com/questions/2624192/good-hash-function-for-strings
function integerHash(string) {
    return (string + '').split('').reduce(function (memo, item) {
        return (memo * 31 * item.charCodeAt(0)) % 982451653;
    }, 7);
}

module.exports = {
    /*
        Memcached limit: 250 bytes in length, no space or newlines for ASCII mode.
        If your keys includes \s, \r or \n, it will be replaced by empty string, Do not throw error.
    */
    validateKey: function (key) {
        if (typeof key !== 'string') {
            return new Error('KEY_TYPE_ERROR');
        }
        if (/[\u0000-\u001F|\u007f|\u0080-\u009f|\s]/.test(key)) {
            return new Error('KEY_VALUE_ERROR');
        }
        if (key.length === 0 || Buffer.byteLength(key) > MAX_KEY_SIZE) {
            return new Error('KEY_LENGTH_ERROR');
        }
        return;
    },

    // escape \r\n
    escapeValue: function (value) {
        return value.replace(/(\r|\n)/g, '\\$1');
    },

    // unescape \r\n
    unescapeValue: function (value) {
        return value.replace(/\\(\r|\n)/g, '$1');
    },

    /*
        Error strings
        -------------

            - "ERROR\r\n"

                means the client sent a nonexistent command name.

            - "CLIENT_ERROR <error>\r\n"

                means some sort of client error in the input line, i.e. the input
                doesn't conform to the protocol in some way. <error> is a
                human-readable error string.

            - "SERVER_ERROR <error>\r\n"

                means some sort of server error prevents the server from carrying
                out the command. <error> is a human-readable error string. In cases
                of severe server errors, which make it impossible to continue
                serving the client (this shouldn't normally happen), the server will
                close the connection after sending the error line. This is the only
                case in which the server closes a connection to a client.
    */
    resError: function (data) {
        if (data === 'ERROR\r\n') {
            return new Error('NONEXISTENT_COMMAND');
        } else if (/^(CLIENT_ERROR)\s{1}.*(\r\n)$/.test(data)) {
            console.log('memcached CLIENT_ERROR:', data);
            return new Error('CLIENT_ERROR');
        } else if (/^(SERVER_ERROR)\s{1}.*(\r\n)$/.test(data)) {
            console.log('memcached SERVER_ERROR:', data);
            return new Error('SERVER_ERROR');
        }
        return false;
    },


    hashMod: function (key, size) {
        return integerHash(md5(key)) % size;
    }
}
