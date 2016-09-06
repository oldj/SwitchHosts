/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

var CodeMirror = require('codemirror');
require('codemirror/mode/shell/shell');
//require('codemirror/addon/mode/overlay');

var my_codemirror;

function resize() {
    var wh = window.innerHeight;
    var oh = $('#left').find('.operations').height();
    var h = wh - $('#sys-list').height() - oh;
    $('#custom-list').css('height', h);
    my_codemirror && my_codemirror.setSize('100%', wh);
}

function init(app) {

    require('./cm_hl').init(app);

    $(document).ready(function () {
        var el_textarea = $('#host-code');
        //el_textarea.css('height', window.innerHeight - 8);

        my_codemirror = CodeMirror.fromTextArea(el_textarea[0], {
            lineNumbers: true,
            readOnly: true,
            mode: 'host'
        });
        app.codemirror = my_codemirror;

        my_codemirror.on('change', function (a) {
            app.onCurrentHostBeChanged(a.getDoc().getValue());
        });

        my_codemirror.on('gutterClick', function (cm, n) {
            if (app.current_host.is_editable === false) return;

            var info = cm.lineInfo(n);
            //cm.setGutterMarker(n, "breakpoints", info.gutterMarkers ? null : makeMarker());
            var ln = info.text;
            if (/^\s*$/.test(ln)) return;

            var new_ln;
            if (/^#/.test(ln)) {
                new_ln = ln.replace(/^#\s*/, '');
            } else {
                new_ln = '# ' + ln;
            }
            my_codemirror.getDoc().replaceRange(new_ln, {line: info.line, ch: 0}, {line: info.line, ch: ln.length});
            //app.caculateHosts();
        });

        $(document).keydown(function (e) {
            if (e.which === 27) {
                app.onESC();
            }
        });

        resize();
        $(window).resize(resize);
    });
}

exports.init = init;
exports.resize = resize;
