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
import m_kw from '../../libs/kw';
import '../../../node_modules/codemirror/lib/codemirror.css';
import './editor.less'

export default class Editor extends React.Component {

    constructor(props) {
        super(props);

        this.codemirror = null;

        modeHost();

        this.marks = [];
        this.kw = '';

        SH_event.on('search', (kw) => {
            this.kw = kw;
            this.highlightKeyword();
        });
    }

    highlightKeyword() {
        while (this.marks.length > 0) {
            this.marks.shift().clear();
        }

        let code = this.props.code;
        let pos = m_kw.findPositions(this.kw, code) || [];
        // this.codemirror.markText({line: 6, ch: 16}, {line: 6, ch: 22}, {className: 'cm-hl'});

        pos.map((p) => {
            this.marks.push(this.codemirror.markText(p[0], p[1], {className: 'cm-hl'}));
        });
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
        setTimeout(() => {
            this.highlightKeyword();
        }, 100);
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
