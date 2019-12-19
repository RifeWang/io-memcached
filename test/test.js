import test from 'ava'
import Memcached from '../lib/memcached';
import * as utils from '../lib/utils';


test.before(t => {
	const memcached = new Memcached(['127.0.0.1:11211'], {
        pool: {
            max: 2,
            min: 0
        },
        timeout: 5000
    });
    t.context.memcached = memcached;
});

test('memcached get/set', async t => {
    try {
        t.plan(4);

        const key = 'testkey';
        const testdata = 'testetsetsetsetsetsetstset\r\n\stesettetsettestst';
        const r = await t.context.memcached.set(key, testdata);
        t.is(r, 'STORED');

        const g = await t.context.memcached.get(key, testdata);
        t.is(g, testdata);

        const dr = await t.context.memcached.del(key);
        t.is(dr, 'DELETED');

        const dn = await t.context.memcached.del(key);
        t.is(dn, 'NOT_FOUND');
    } catch (error) {
        t.fail(error.message);
    }
});

test('memcached concurrent get', async t => {
    try {
        let testdata = 'testetsetsetsetsetsetstset\r\n\stesettetsettestst';
        const testdata2 = 'testetsetsetsetsetsetstset\r\n\stesettetsettestst';
        for (let i = 0; i < 2000; i++) {
            testdata = testdata + testdata2;
        }

        const key = 'concurrentkey';
        await t.context.memcached.set(key, testdata);


        const arr = [];
        for (let i = 0; i < 1000; i++) {
            arr.push(t.context.memcached.get(key));
        }
        const result = await Promise.all(arr);
        let i = 0;
        result.forEach(e => {
            i++;
            if (e.length != testdata.length) {
                t.fail('concurrent get error');
            }
        });
        t.is(result.length, i);

        await t.context.memcached.del(key);
    } catch (error) {
        t.fail(error.message);
    }
});

test('memcached incr/decr', async t => {
    try {
        t.plan(5);

        const key = 'this_is_a_not_found_key';
        const r = await t.context.memcached.incr(key, 1000);
        t.is(r, 'NOT_FOUND');

        const d = await t.context.memcached.decr(key, 1000);
        t.is(d, 'NOT_FOUND');

        await t.context.memcached.set(key, 0);
        const ic = await t.context.memcached.incr(key, 1000);
        t.is(ic, 1000);

        const de = await t.context.memcached.decr(key, 100);
        t.is(de, 900);

        const dec = await t.context.memcached.decr(key, 10000);
        t.is(dec, 0);

        await t.context.memcached.del(key);
    } catch (error) {
        t.fail(error.message);
    }
});

test('memcached cluster', async t => {
    try {
        t.plan(100);

        const servers = ['127.0.0.1:11211', '127.0.0.2:11211', '127.0.0.3:11211'];
        const memcached = new Memcached(servers, {
            clusterAlgFunc: function(key) {
                const i = utils.hashMod(key, servers.length);
                return servers[i];
            }
        });
        const memcached2 = new Memcached(servers, {
            clusterAlg: 'hash'
        });

        for (let i = 0; i < 100; i++) {
            const key = 'key' + i;
            const s = memcached._getServerByKey(key);
            const ss = memcached2._getServerByKey(key);
            t.is(s, ss);
        }
    } catch (error) {
        t.fail(error.message);
    }
});