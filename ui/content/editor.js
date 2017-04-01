/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

import React from 'react'
import CodeMirror from 'codemirror'
// import '../../../node_modules/codemirror/addon/comment/comment'
import 'codemirror/addon/comment/comment'
import classnames from 'classnames'
import m_kw from './kw'
import Agent from '../Agent'
import 'codemirror/lib/codemirror.css'
import './editor.less'

import modeHosts from './cm_hl'
modeHosts()

export default class Editor extends React.Component {

  constructor (props) {
    super(props)

    this.codemirror = null

    this.marks = []
    this.kw = ''

    this.state = {}

    Agent.on('search', (kw) => {
      this.kw = kw
      this.highlightKeyword()
    })
  }

  highlightKeyword () {
    while (this.marks.length > 0) {
      this.marks.shift().clear()
    }

    let code = this.props.code
    let pos = m_kw.findPositions(this.kw, code) || []
    // this.codemirror.markText({line: 6, ch: 16}, {line: 6, ch: 22}, {className: 'cm-hl'});

    pos.map((p) => {
      this.marks.push(this.codemirror.markText(p[0], p[1], {className: 'cm-hl'}))
    })
  }

  setValue (v) {
    this.props.setValue(v)
  }

  toComment () {
    let doc = this.codemirror.getDoc()
    let cur = doc.getCursor()
    let line = cur.line
    let info = doc.lineInfo(line)
    this.codemirror.toggleComment({
      line: line,
      cur: 0
    }, {
      line: line,
      cur: info.text.length
    })
  }

  componentDidMount () {
    // console.log(this.cnt_node, this.cnt_node.value);
    this.codemirror = CodeMirror.fromTextArea(this.cnt_node, {
      lineNumbers: true,
      readOnly: true,
      mode: 'hosts'
    })

    this.codemirror.setSize('100%', '100%')

    this.codemirror.on('change', (a) => {
      let v = a.getDoc().getValue()
      this.setValue(v)
    })

    this.codemirror.on('gutterClick', (cm, n) => {
      if (this.props.readonly === true) return

      let info = cm.lineInfo(n)
      //cm.setGutterMarker(n, "breakpoints", info.gutterMarkers ? null : makeMarker());
      let ln = info.text
      if (/^\s*$/.test(ln)) return

      let new_ln
      if (/^#/.test(ln)) {
        new_ln = ln.replace(/^#\s*/, '')
      } else {
        new_ln = '# ' + ln
      }
      this.codemirror.getDoc()
        .replaceRange(new_ln, {line: info.line, ch: 0}, {
          line: info.line,
          ch: ln.length
        })
      //app.caculateHosts();
    })

    Agent.on('to_comment', () => {
      this.toComment()
    })
  }

  componentWillReceiveProps (next_props) {
    // console.log(next_props);
    let cm = this.codemirror
    let v = cm.getDoc().getValue()
    if (v !== next_props.code) {
      cm.getDoc().setValue(next_props.code)
    }
    cm.setOption('readOnly', next_props.readonly)
    setTimeout(() => {
      this.highlightKeyword()
    }, 100)
  }

  render () {
    return (
      <div
        id="sh-editor"
        className={classnames({
          readonly: this.props.readonly
        })}>
                <textarea
                  ref={(c) => this.cnt_node = c}
                  defaultValue={this.props.code || ''}
                />
      </div>
    )
  }
}
