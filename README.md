![npm](https://img.shields.io/npm/v/io-memcached?logo=npm) ![GitHub Workflow Status](https://img.shields.io/github/workflow/status/rifewang/io-memcached/GitHub%20Actions%20CI?logo=github) ![Codecov](https://img.shields.io/codecov/c/github/rifewang/io-memcached?logo=codecov) ![npm](https://img.shields.io/npm/dm/io-memcached?logo=npm) ![GitHub last commit](https://img.shields.io/github/last-commit/rifewang/io-memcached?logo=node.js)

# io-memcached
Memcached client for node.js.
-  Promise
- build-in TCP Connection Pool
- support memcached cluster, base on consistent hashing algorithm.

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

        await memcached.set(key, 100);
        const cr = await memcached.incr(key, 123);
        console.log(':::: incr result :::::', cr);

        const dr = await memcached.decr(key, 12);
        console.log(':::: decr result :::::', dr);

        await memcached.del(key);
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
- `clusterAlg` : cluster algorithm.
    - `c-hash` : (default). consistent hashing algorithm.
    - `hash`   : hash mod algorithm.

- `clusterAlgFunc` : custom cluster algorithm function. receive a key and return a server address, it will ignore the `clusterAlg` if `clusterAlgFunc` defined:
```
const servers = ['127.0.0.1:11211', '127.0.0.2:11211'];
const memcached3 = new Memcached(servers, {
    clusterAlgFunc: function(key) {
        // do something , and return a server address.
        // the result must be in server locations. if not , you will get 'cluster algorithm function error'.

        return '127.0.0.1:11211';
    }
});
```

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

### Incr / Decr
- `incr(key, value)`
- `decr(key, value)`

return:
- `NOT_FOUND` (string) : the key not exist.
- `value` (number) : value is the new value of the item's data. if a client tries
to decrease the value below 0, the new value will be 0.

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
- `KEY_VALUE_ERROR` : the key must not include control characters or whitespace.
- `KEY_LENGTH_ERROR` : max 250 bytes in length.

### value error
- `VALUE_LENGTH_ERROR` : max 1 MB. occurred in set method.

## TODO
io-memcached only support several methods at now.


## Lisense
MIT