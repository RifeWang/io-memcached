const net = require('net');
const HashRing = require('hashring');
const genericPool = require('generic-pool');
const utils = require('./utils');


// max bytes size for value, memcached limit 1 MB.
const MAX_VALUE_SIZE = 1048576;


/*
    "set", "add", "replace", "append" or "prepend"
    -------------

        - "STORED\r\n"

            to indicate success.

        - "NOT_STORED\r\n"

            to indicate the data was not stored, but not because of an error.
            This normally means that the condition for an "add" or a "replace"
            command wasn't met.

        - "EXISTS\r\n"

            to indicate that the item you are trying to store with a "cas" command
            has been modified since you last fetched it.

        - "NOT_FOUND\r\n"

            to indicate that the item you are trying to store with a "cas" command
            did not exist.
*/
const STORAGE_REPLY = ['STORED\r\n', 'NOT_STORED\r\n', 'EXISTS\r\n', 'NOT_FOUND\r\n'];


/*
    "delete"
    -------------

        - "DELETED\r\n"

            to indicate success

        - "NOT_FOUND\r\n"

            to indicate that the item with this key was not found.
*/
const DELETE_REPLY = ['DELETED\r\n', 'NOT_FOUND\r\n'];


// end of response
const END_BUF = Buffer.from('\r\n');


/*
    auto generate flag for different data type
        - string        :   0
        - json object   :   2
        - binary        :   4
        - number        :   8
*/
const FLAG_STRING = 0;
const FLAG_JSON = 1 << 1;
const FLAG_BINARY = 1 << 2;
const FLAG_NUMERIC = 1 << 3;


class Memcached {
    constructor(serverLocations, options) {
        if (!Array.isArray(serverLocations)) {
            throw Error('server locations error.');
        }
        this._serverLocations = serverLocations.map(v => {
            if (typeof v !== 'string') {
                throw Error('server locations error.');
            }
            v = v.replace(/\s/g, '');
            const h_p = v.split(':');
            if (h_p.length !== 2) {
                throw Error('server locations error.');
            }
            if (!Number.isInteger(Number(h_p[1]))) {
                throw Error('server locations error.');
            }
            return v;
        });
        this._configs = {
            ...{
                clusterAlg: 'c-hash',
                clusterAlgFunc: false,
                pool: {
                    max: 1,
                    min: 0,
                    idle: 30000,             // 30000 ms.
                },
                timeout: 5000,              // timeout for every command, 5000 ms.
                retries: 5,                 // max retry times for failed request.
                maxWaitingClients: 10000,   // maximum number of queued requests allowed
            }, ...options
        };
        this._hashring = new HashRing(this._serverLocations);
        this._pools = {};
    }


    _buildPool(remote_server) {
        const factory = {
            create: function () {
                return new Promise((resolve, reject) => {
                    const host = remote_server.split(':')[0];
                    const port = remote_server.split(':')[1];
                    const socket = new net.Socket();
                    socket.connect({
                        host: host, // 目标主机
                        port: port, // 目标端口
                    });
                    socket.setKeepAlive(true);
                    socket.on('connect', () => {
                        console.log(`socket connected: ${remote_server} , local: ${socket.localAddress}:${socket.localPort}`);
                        resolve(socket);
                    });
                    socket.on('error', error => {
                        console.log(`socket error: ${remote_server} , ${error}`);
                        reject(error);
                    });
                    socket.on('close', hadError => {
                        console.log(`socket closed: ${remote_server} , transmission error: ${hadError}`);
                    });
                });
            },
            destroy: function (socket) {
                return new Promise((resolve) => {
                    socket.destroy();
                    resolve();
                });
            },
            validate: function (socket) { // validate socket
                return new Promise((resolve) => {
                    if (socket.connecting || socket.destroyed || !socket.readable || !socket.writable) {
                        return resolve(false);
                    } else {
                        return resolve(true);
                    }
                });
            }
        };
        this._pools[remote_server] = genericPool.createPool(factory, {
            max: this._configs.pool.max,
            min: this._configs.pool.min,
            testOnBorrow: true,
            maxWaitingClients: this._configs.maxWaitingClients
        });
        return;
    }

    _getServerByKey(key) {
        if (typeof this._configs.clusterAlgFunc === 'function') {
            const result = this._configs.clusterAlgFunc(key);
            if (!this._serverLocations.includes(result)) {
                throw new Error('cluster algorithm function error');
            }
            return result;
        }
        if (this._serverLocations.length === 1) {
            return this._serverLocations[0];
        }
        if (this._configs.clusterAlg === 'hash') {
            const i = utils.hashMod(key, this._serverLocations.length);
            return this._serverLocations[i];
        }
        return this._hashring.get(key); // consistent hash
    }

    /*
        send command and receive reply,
        return complete response data.
    */
    _request(key, command) {
        return new Promise(async (resolve, reject) => {
            try {
                const remote_server = this._getServerByKey(key);

                let pool = this._pools[remote_server];
                if (pool === undefined) {
                    this._buildPool(remote_server);
                }
                pool = this._pools[remote_server];
                const s = await pool.acquire(); // acquire tcp socket

                const bufs = [];
                s.on('data', async buf => {
                    bufs.push(buf);

                    if (END_BUF.equals(buf.slice(-2))) {
                        s.removeAllListeners('data'); // must remove all listeners for data event
                        try {
                            await pool.release(s); // it is safe to ignore this promise.
                        } catch (error) { }
                        const data = Buffer.concat(bufs).toString();
                        return resolve(data);
                    }
                });

                s.write(command);
            } catch (error) {
                return reject(error);
            }
        });
    }


    // get
    async get(key) {
        return new Promise(async (resolve, reject) => {
            try {
                // validate key
                const key_error = utils.validateKey(key);
                if (key_error) {
                    return reject(key_error);
                }

                // setTimeout
                setTimeout((reject) => {
                    return reject(new Error(`timeout of ${this._configs.timeout}ms exceeded: get ${key}`));
                }, this._configs.timeout, reject);


                const command = `get ${key}\r\n`;
                const data = await this._request(key, command);

                const res_error = utils.resError(data);
                if (res_error) {
                    return reject(res_error);
                }

                // key not exist
                if (data === 'END\r\n') {
                    return resolve(undefined);
                }

                /*
                    VALUE <key> <flags> <bytesLength> [<cas unique>]\r\n
                    <data block>\r\n
                */
                const data_arr = data.split('\r\n');
                if (data_arr.length < 4) {
                    console.log('memcached lib get error0:', data_arr);
                    return reject(new Error('PARSE_RESULT_ERROR_0'));
                }
                const response_line = data_arr[0].split(' ');
                if (response_line.length !== 4) {
                    console.log('memcached lib get error1:', response_line);
                    return reject(new Error('PARSE_RESULT_ERROR_1'));
                }
                if (response_line[0] !== 'VALUE' || response_line[1] !== key) {
                    console.log('memcached lib get error2:', response_line);
                    return reject(new Error('PARSE_RESULT_ERROR_2'));
                }
                const value_flag = response_line[2];
                const value_length = Number(response_line[3]);

                let value = data_arr.slice(1, -2).join('');
                if (Buffer.byteLength(value) !== value_length) {
                    console.log('memcached lib get error3:', Buffer.byteLength(value), value_length);
                    return reject(new Error('PARSE_RESULT_ERROR_3'));
                }
                value = utils.unescapeValue(value); // unescape \r\n
                if (value_flag == FLAG_JSON) {
                    return resolve(JSON.parse(value));
                }
                if (value_flag == FLAG_NUMERIC) {
                    return resolve(Number(value));
                }
                if (value_flag == FLAG_BINARY) {
                    return resolve(Buffer.from(value));
                }
                return resolve(value); // string
            } catch (error) {
                return reject(error);
            }
        });
    }


    /*
        ttl: An expiration time, in seconds. '0' means never expire. Can be up to 30 days. After 30 days, is treated as a unix timestamp of an exact date.
    */
    async set(key, value, ttl = 0) {
        return new Promise(async (resolve, reject) => {
            try {
                // validate key
                const key_error = utils.validateKey(key);
                if (key_error) {
                    return reject(key_error);
                }

                // validate value and generate flag
                let flag = FLAG_STRING; // default string
                if (Buffer.isBuffer(value)) {
                    flag = FLAG_BINARY;
                    value = value.toString('binary');
                } else if (typeof value === 'number') {
                    flag = FLAG_NUMERIC;
                    value = value.toString();
                } else if (typeof value !== 'string') {
                    flag = FLAG_JSON;
                    try {
                        value = JSON.stringify(value);
                    } catch {
                        return reject(new Error('VALUE_TYPE_ERROR'));
                    }
                }
                value = utils.escapeValue(value); // escape \r\n
                const value_length = Buffer.byteLength(value);
                if (value.length === 0 || value_length > MAX_VALUE_SIZE) {
                    return reject(new Error('VALUE_LENGTH_ERROR'));
                }


                // validate ttl
                ttl = Number(ttl);
                if (Number.isNaN(ttl) || ttl < 0) {
                    ttl = 0;
                } else {
                    ttl = Math.floor(ttl);
                }


                // setTimeout
                setTimeout((reject) => {
                    return reject(new Error(`timeout of ${this._configs.timeout}ms exceeded: set ${key}`));
                }, this._configs.timeout, reject);


                const command = `set ${key} ${flag} ${ttl} ${value_length}\r\n${value}\r\n`;
                const data = await this._request(key, command);

                const res_error = utils.resError(data);
                if (res_error) {
                    return reject(res_error);
                }

                if (STORAGE_REPLY.includes(data)) {
                    return resolve(data.split('\r\n')[0]);
                } else {
                    return reject(new Error('UNKOWN_RESPONSE'));
                }
            } catch (error) {
                return reject(error);
            }
        });
    }

    // alias for delete
    async del(key) {
        return this.delete(key);
    }

    // delete
    async delete(key) {
        return new Promise(async (resolve, reject) => {
            try {
                // validate key
                const key_error = utils.validateKey(key);
                if (key_error) {
                    return reject(key_error);
                }


                // setTimeout
                setTimeout((reject) => {
                    return reject(new Error(`timeout of ${this._configs.timeout}ms exceeded: delete ${key}`));
                }, this._configs.timeout, reject);


                const command = `delete ${key}\r\n`;
                const data = await this._request(key, command);

                const res_error = utils.resError(data);
                if (res_error) {
                    return reject(res_error);
                }

                if (DELETE_REPLY.includes(data)) {
                    return resolve(data.split('\r\n')[0]);
                } else {
                    return reject(new Error('UNKOWN_RESPONSE'));
                }
            } catch (error) {
                return reject(error);
            }
        });
    }


    async _incrdecr(method, key, value) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!['incr', 'decr'].includes(method)) {
                    return reject(new Error('LIB_ERROR'));
                }

                // validate key
                const key_error = utils.validateKey(key);
                if (key_error) {
                    return reject(key_error);
                }

                value = Number(value);
                if (!Number.isInteger(value) || value < 0) {
                    return reject(new Error('VALUE_TYPE_ERROR'));
                }


                // setTimeout
                setTimeout((reject) => {
                    return reject(new Error(`timeout of ${this._configs.timeout}ms exceeded: incr ${key} ${value}`));
                }, this._configs.timeout, reject);


                const command = `${method} ${key} ${value}\r\n`;
                const data = await this._request(key, command);

                const res_error = utils.resError(data);
                if (res_error) {
                    return reject(res_error);
                }


                /*
                    - NOT_FOUND\r\n : the item with this value was not found
                    - <value>\r\n : value is the new value of the item's data
                */
                const result = data.split('\r\n')[0];
                return resolve(result === 'NOT_FOUND' ? result : Number(result));
            } catch (error) {
                return reject(error);
            }
        });
    }


    // incr
    async incr(key, value) {
        return this._incrdecr('incr', key, value);
    }

    // decr
    async decr(key, value) {
        return this._incrdecr('decr', key, value);
    }
}


module.exports = Memcached;