const Memcached = require('../lib/memcached');
const utils = require('../lib/utils');


let testdata = 'testetsetsetsetsetsetstset\r\n\stesettetsettestst';
const testdata2 = 'testetsetsetsetsetsetstset\r\n\stesettetsettestst';
for (let i = 0; i < 2000; i++) {
    testdata = testdata + testdata2;
}

(async () => {
    try {
        const memcached = new Memcached(['127.0.0.1:11211'], {
            pool: {
                max: 10,
                min: 0
            },
            timeout: 5000
        });


        const key = 'testkey';
        const r = await memcached.set(key, testdata);
        console.log(':::: set :::::', r);


        const arr = [];
        for (let i = 0; i < 100; i++) {
            arr.push(memcached.get(key));
        }
        const result = await Promise.all(arr);
        let i = 0;
        result.forEach(e => {
            i++;
            if (e.length != testdata.length) {
                throw Error('concurrent get error');
            }
        });
        console.log(':::: concurrent get ::::', result.length, i);


        const d = await memcached.del(key);
        console.log(':::: del :::::', d);

        await memcached.set(key, 100);
        const cr = await memcached.incr(key, 123);
        console.log(':::: incr :::::', cr, typeof cr);

        const dr = await memcached.decr(key, 1299999);
        console.log(':::: decr :::::', dr);
        await memcached.del(key);


        const memcached2 = new Memcached(['127.0.0.1:11211', '127.0.0.2:11211'], {
            clusterAlg: 'hash'
        });
        console.log(memcached2._getServerByKey('1'))
        console.log(memcached2._getServerByKey('1'))
        console.log(memcached2._getServerByKey('2'))
        console.log(memcached2._getServerByKey('2'))
        console.log(memcached2._getServerByKey('3'))
        console.log(memcached2._getServerByKey('4'))

        const servers = ['127.0.0.1:11211', '127.0.0.2:11211'];
        const memcached3 = new Memcached(servers, {
            clusterAlgFunc: function(key) {
                const i = utils.hashMod(key, servers.length);
                return servers[i];
            }
        });
        console.log('==', memcached3._getServerByKey('1'))
        console.log('==', memcached3._getServerByKey('1'))
        console.log('==', memcached3._getServerByKey('2'))
        console.log('==', memcached3._getServerByKey('2'))
        console.log('==', memcached3._getServerByKey('3'))
        console.log('==', memcached3._getServerByKey('4'))
    } catch (error) {
        console.log('error:', error);
    }
})()