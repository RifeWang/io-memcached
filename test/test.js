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
    } catch (error) {
        console.log('error:', error);
    }
})()