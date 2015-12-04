// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

(function (mod) {
    mod(require("codemirror"));
})(function (CodeMirror) {
    "use strict";

    CodeMirror.defineMode('host', function () {

        return {
            token: function(stream) {
                let tw_pos = stream.string.search(/[\t ]+?$/);

                //if (!stream.sol() || tw_pos === 0) {
                //    stream.skipToEnd();
                    //return ("error " + (TOKEN_NAMES[stream.string.charAt(0)] || '')).replace(/ $/, '');
                //}
                //console.log(stream.string);

                let c = stream.peek();
                let token_name;
                if (c == '#') {
                    token_name = 'comment';
                //} else if (!stream.string.match(/^\s*[\d\.]+\s+\w/i)) {
                } else if (!stream.string.match(/^\s*([\d\.]+|[\da-f:\.%lo]+)\s+\w/i)) {
                    token_name = 'error';
                } else {
                    token_name = stream.skipToEnd();
                }

                //let ip = stream.string.match(/^[\d\.]+\s/);
                //if (ip) {
                //    token_name = 'positive';
                //    stream.pos = ip[0].length - 1;
                //}

                //if (tw_pos === -1) {
                //    stream.skipToEnd();
                //} else {
                //    stream.pos = tw_pos;
                //}
                stream.skipToEnd();

                return token_name;
            },
            lineComment: '#'
        };
    });

    //CodeMirror.defineMIME('text/x-host', 'host');

});
