/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../../lib/codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";

    CodeMirror.defineMode('host', function () {
        function tokenBase(stream) {
            if (stream.eatSpace()) return null;

            var sol = stream.sol();
            var ch = stream.next();

            if (ch === '#') {
                stream.skipToEnd();
                return 'comment';
            }
            if (!stream.string.match(/^\s*([\d\.]+|[\da-f:\.%lo]+)\s+\w/i)) {
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

    CodeMirror.defineMIME('text/x-sh', 'shell');

});
