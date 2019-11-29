![npm (tag)](https://img.shields.io/npm/v/io-memcached/latest) ![NPM](https://img.shields.io/npm/l/io-memcached)
# io-memcached
Memcached client for node.js, based on Promise, build-in Connection Pool, supporting clusters based on consistent hashing algorithm.

io-memcached is used in my production and works well.

## Install
```
npm install io-memcached
```

## Example
```
const Memcached = require('io-memcached');

const memcached = new Memcached(['127.0.0.1:11211'], {
    pool: {
        max: 10,
        min: 1
    },
    timeout: 3000
});

(async () => {
    try {
        const key = 'testkey';
        const data = 'test test\r test\n test\r\n \r\n';

        const s = await memcached.set(key, data);
        console.log(':::: set :::::', s);

        const g = await memcached.get(key);
        console.log(':::: get :::::', g);

        const d = await memcached.del(key);
        console.log(':::: del :::::', d);
    } catch (error) {
        console.log('error:', error);
    }
})()
```

## API
All public methods base on node native promise.

### Setting up clent
The constructor of the memcached client take 2 different arguments server locations and options. Syntax:
```
var Memcached = require('io-memcached');
var memcached = new Memcached(Server locations, options);
```

#### server locations
For uniform style, server locations only support Array at now, even you have only one server. like this:
```
const memcached = new Memcached(['127.0.0.1:11211']);
const memcached = new Memcached(['192.168.0.1:11211', '192.168.0.2:11211'];
```

#### options
- `pool` :
    - `max` : maximum number of tcp connection for everyone server. (default=1)
    - `min` : minimum number of tcp connection to keep in pool at any given time. If this is set >= max, the pool will silently set the min to equal max. (default=0)
- `timeout` : timeout for every request.(default=5000 ms)
- `maxWaitingClients` : maximum number of queued requests allowed.(default=10000)

### Get
`get(key)`

return different type:
- `undefined` : if the key not exist in memcached.
- value : the value will be `JSON.parse()` for object, `Number()` for number, `Buffer.from()` for binary, and default string.

### Set
`set(key, value, ttl=0)`

this lib will auto generate flag and store it in memcached for different data type, it's build-in and the flag will be used in get method for parse result data. You do not need to care about it.

`ttl` is time-to-live for key-value, in seconds. '0' means never expire. Can be up to 30 days. After 30 days, is treated as a unix timestamp of an exact date.

return a string:
- `STORED` : to indicate success.
- `NOT_STORED` : to indicate the data was not stored, but not because of an error. This normally means that the condition for an "add" or a "replace" command wasn't met.
- `EXISTS` : to indicate that the item you are trying to store with a "cas" command has been modified since you last fetched it.
- `NOT_FOUND` : to indicate that the item you are trying to store with a "cas" command did not exist.

### Delete
`delete(key)` alias `del(key)`

return a string:
- `DELETED` : to indicate success.
- `NOT_FOUND` : to indicate that the item with this key was not found.

## Error
You should catch errors in you code.

### common error
- `ERROR` : means the client sent a nonexistent command name.
- `CLIENT_ERROR` : means some sort of client error in the input line, i.e. the input doesn't conform to the protocol in some way.
- `SERVER_ERROR` : means memcached server error.

### timeout error
like : `timeout of 5000ms exceeded`

### key error
- `KEY_TYPE_ERROR` : not a string.
- `KEY_VALUE_ERROR` : key includes \s, \r or \n.
- `KEY_LENGTH_ERROR` : max 250 bytes in length.

### value error
- `VALUE_LENGTH_ERROR` : max 1 MB. occurred in set method.

## TODO
io-memcached only support three method at now, it is simple.


## Lisense
MIT