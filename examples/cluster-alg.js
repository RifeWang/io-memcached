const Memcached = require('../lib/memcached');
const utils = require('../lib/utils');

(async () => {
    try {
        const servers = ['127.0.0.1:11211', '127.0.0.2:11211', '127.0.0.3:11211'];
        const memcached2 = new Memcached(servers, {
            clusterAlg: 'hash'
        });
        console.log(memcached2._getServerByKey('key1'));


        // custom cluster algorithm function
        const memcached3 = new Memcached(servers, {
            clusterAlgFunc: function(key) {
                const i = utils.hashMod(key, servers.length);
                return servers[i];
            }
        });
        console.log(memcached3._getServerByKey('key1'));
    } catch (error) {
        console.log('error:', error);
    }
})()