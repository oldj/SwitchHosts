/**
 * editor
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

import React from 'react';
import CodeMirror from 'codemirror';
import classnames from 'classnames';
import modeHost from './cm_hl';
import '../../../node_modules/codemirror/lib/codemirror.css';
import './editor.less'

export default class Editor extends React.Component {

    constructor(props) {
        super(props);

        this.codemirror = null;

        modeHost(this.state);
    }

    setValue(v) {
        this.props.setValue(v);
    }

    componentDidMount() {
        // console.log(this.cnt_node, this.cnt_node.value);
        this.codemirror = CodeMirror.fromTextArea(this.cnt_node, {
            lineNumbers: true,
            readOnly: true,
            mode: 'host'
        });

        this.codemirror.setSize('100%', '100%');

        this.codemirror.on('change', (a) => {
            let v = a.getDoc().getValue();
            this.setValue(v);
        });

        this.codemirror.on('gutterClick', (cm, n) => {
            if (this.props.readonly === true) return;

            let info = cm.lineInfo(n);
            //cm.setGutterMarker(n, "breakpoints", info.gutterMarkers ? null : makeMarker());
            let ln = info.text;
            if (/^\s*$/.test(ln)) return;

            let new_ln;
            if (/^#/.test(ln)) {
                new_ln = ln.replace(/^#\s*/, '');
            } else {
                new_ln = '# ' + ln;
            }
            this.codemirror.getDoc().replaceRange(new_ln, {line: info.line, ch: 0}, {line: info.line, ch: ln.length});
            //app.caculateHosts();
        });
    }

    componentWillReceiveProps(next_props) {
        // console.log(next_props);
        this.codemirror.getDoc().setValue(next_props.code);
        this.codemirror.setOption('readOnly', next_props.readonly);
    }

    render() {
        return (
            <div id="sh-editor" className={classnames({
                readonly: this.props.readonly
            })}>
                <textarea
                    ref={(c) => this.cnt_node = c}
                    defaultValue={this.props.code || ''}
                />
            </div>
        );
    }
}
