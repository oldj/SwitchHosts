/**
 * default_data, created on 2016/8/27.
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

function makeDefaultData() {
    return {
        sys: {
            is_sys: true
            , content: ''
        },
        list: [
            {
                title: 'my hosts',
                content: '# input hosts here\n\n'
            }
        ]
    };
}

exports.make = makeDefaultData;
