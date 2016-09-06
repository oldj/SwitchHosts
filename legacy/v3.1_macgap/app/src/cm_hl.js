// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

exports.init = function (app) {

    (function (mod) {
        mod(require('codemirror'));
    })(function (CodeMirror) {
        'use strict';

        CodeMirror.defineMode('host', function () {
            function tokenBase(stream) {
                if (stream.eatSpace()) return null;

                var sol = stream.sol();
                var ch = stream.next();

                var s = stream.string;
                var kw = app.search_keyword;
                var r = app.search_regexp;
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

    });
};
