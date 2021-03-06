const Memcached = require('../lib/memcached');

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


        const g = await memcached.get(key);
        console.log(':::: get ::::', g === testdata);


        const d = await memcached.del(key);
        console.log(':::: del :::::', d);


        await memcached.set(key, 100);
        const cr = await memcached.incr(key, 123);
        console.log(':::: incr :::::', cr, typeof cr);


        const dr = await memcached.decr(key, 1299999);
        console.log(':::: decr :::::', dr);


        await memcached.del(key);
    } catch (error) {
        console.log('error:', error);
    }
    process.exit();
})()