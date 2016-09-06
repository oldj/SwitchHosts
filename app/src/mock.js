/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

exports.hosts = {
    sys: {
        content: 'test'
    },
    custom: [{
        title: 'c1',
        content: '1111',
        is_remote: false,
        url: ''
    }, {
        title: 'c2',
        content: '2222',
        is_remote: false,
        url: ''
    }, {
        title: 'c3',
        content: '3333',
        is_remote: true,
        url: 'http://test.com/t.txt'
    }]
};
