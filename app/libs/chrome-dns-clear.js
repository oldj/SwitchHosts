'use strict'

const Chrome = require('chrome-remote-interface');

function clearDNSCache() {
    Chrome(function (chrome) {
        const { Runtime} = chrome
        Runtime.enable();
        Runtime.evaluate({ expression: "chrome.benchmarking.clearHostResolverCache();" })
        Runtime.evaluate({ expression: "chrome.benchmarking.clearCache();" })
        Runtime.evaluate({ expression: "chrome.benchmarking.closeConnections();" })
        console.log('DNS Cache Clear');
    }).on('error', function (e) {
        console.error(e);
        console.error('Cannot connect to chrome');
    })

}

module.exports = exports  = clearDNSCache;