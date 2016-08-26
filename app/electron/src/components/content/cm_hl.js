// custom mode

'use strict';

import CodeMirror from 'codemirror';
import {kw2re} from '../../libs/kw';

export default function () {

    const state = {
        search_kw: '',
        search_re: null,
    };

    SH_event.on('search', (kw) => {
        state.search_kw = kw;
        state.search_re = kw ? kw2re(kw) : null
    });


    CodeMirror.defineMode('host', function () {
        function tokenBase(stream) {
            if (stream.eatSpace()) return null;

            var sol = stream.sol();
            var ch = stream.next();

            var s = stream.string;
            var kw = state.search_kw;
            var r = state.search_re;
            if ((kw && s.indexOf(kw) > -1) || (r && s.match(r))) {
                return 'hl';
            }

            if (ch === '#') {
                stream.skipToEnd();
                return 'comment';
            }
            if (!s.match(/^\s*([\d\.]+|[\da-f:\.%lo]+)\s+\w/i)) {
                return 'error';
            }

            if (sol && ch.match(/[\w\.:%]/)) {
                stream.eatWhile(/[\w\.:%]/);
                return 'ip';
            }

            return null;
        }

        function tokenize(stream, state) {
            return (state.tokens[0] || tokenBase)(stream, state);
        }

        return {
            startState: function () {
                return {tokens: []};
            },
            token: function (stream, state) {
                return tokenize(stream, state);
            },
            lineComment: '#'
        };
    });

    //CodeMirror.defineMIME('text/x-host', 'host');
}
