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
import * as func from '../libs/search'
import 'codemirror/lib/codemirror.css'
import styles from './Editor.less'

import modeHosts from './cm_hl'

modeHosts()

export default class Editor extends React.Component {

  constructor (props) {
    super(props)

    this.codemirror = null

    this.state = {
      marks: [],
      pos: [],
      search_kw: '',
      id: null,
      code: '',
      readonly: false
    }

  }

  //highlightKeyword () {
  //  while (this.marks.length > 0) {
  //    this.marks.shift().clear()
  //  }
  //
  //  let code = this.props.code
  //  let pos = m_kw.findPositions(this.kw, code) || []
  //  // this.codemirror.markText({line: 6, ch: 16}, {line: 6, ch: 22}, {className: 'cm-hl'});
  //
  //  pos.map((p) => {
  //    this.marks.push(this.codemirror.markText(p[0], p[1], {className: 'cm-hl'}))
  //  })
  //}

  doSearch () {
    let {marks, search_kw} = this.state
    while (marks.length > 0) {
      marks.shift().clear()
    }
    let pos = []

    let {code} = this.props
    if (search_kw && code) {
      pos = m_kw.findPositions(search_kw, code)
      pos.map(p => {
        marks.push(this.codemirror.markText(p[0], p[1], {className: 'cm-hl'}))
      })
    }

    let doc = this.codemirror.getDoc()
    let cursor = doc.getCursor()

    this.setState({marks, pos}, () => {
      Agent.emit('search:state', {
        count: marks.length,
        pos: pos.slice(0),
        has_next: !!this.getNext(),
        has_previous: !!this.getPrevious(),
        cursor
      })
    })
  }

  setValue (v) {
    this.props.setValue(v)
  }

  toComment () {
    if (this.props.readonly === true) return

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

  getNext () {
    let doc = this.codemirror.getDoc()
    let cursor = doc.getCursor()
    let {pos} = this.state
    let next_pos = func.getNextPos(pos, cursor)
    //console.log(next_pos)
    return next_pos
  }

  gotoNext () {
    this.docSelect(this.getNext())
  }

  getPrevious () {
    let doc = this.codemirror.getDoc()
    let cursor = doc.getCursor()
    let {pos} = this.state
    let prev_pos = func.getPreviousPos(pos, cursor)
    //console.log(next_pos)
    return prev_pos
  }

  gotoPrevious () {
    this.docSelect(this.getPrevious())
  }

  docSelect (pos) {
    console.log(pos)
    if (!pos || !Array.isArray(pos)) return
    let doc = this.codemirror.getDoc()
    doc.setCursor(pos[1])
    doc.setSelection(pos[0], pos[1])

    Agent.emit('search:state', {
      has_next: !!this.getNext(),
      has_previous: !!this.getPrevious()
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

    Agent.on('search:goto_previous', () => this.gotoPrevious())
    Agent.on('search:goto_next', () => this.gotoNext())
    Agent.on('editor:select', pos => this.docSelect(pos))

    Agent.on('search:kw', kw => {
      //this.highlightKeyword()
      this.setState({search_kw: kw}, () => this.doSearch())
    })
  }

  //componentWillReceiveProps (next_props) { // todo ...
  //  //console.log(next_props);
  //  let cm = this.codemirror
  //  let doc = cm.getDoc()
  //  let v = doc.getValue()
  //  if (v !== next_props.code) {
  //    let cursor_pos = doc.getCursor()
  //    doc.setValue(next_props.code)
  //    doc.setCursor(cursor_pos)
  //  }
  //  cm.setOption('readOnly', next_props.readonly)
  //  setTimeout(() => {
  //    //this.highlightKeyword()
  //    this.doSearch()
  //  }, 100)
  //}

  static getDerivedStateFromProps (nextProps, prevState) {
    let state = {}

    ;(['code', 'readonly', 'id']).map(k => {
      if (prevState[k] !== nextProps[k]) {
        state[k] = nextProps[k]
      }
    })

    return state
  }

  componentDidUpdate (prevProps, prevState) {
    let cm = this.codemirror
    let doc = cm.getDoc()

    let {code, readonly, id} = this.state
    if (doc.getValue() !== code) {
      let cursor_pos = doc.getCursor()
      doc.setValue(code)
      doc.setCursor(cursor_pos)
    }

    if (id !== prevState.id) {
      setTimeout(() => doc.clearHistory(), 300)
    }

    cm.setOption('readOnly', readonly)
    setTimeout(() => {
      //this.highlightKeyword()
      this.doSearch()
    }, 100)
  }

  render () {
    return (
      <div
        id="sh-editor"
        className={classnames({
          [styles.root]: 1,
          readonly: this.props.readonly,
          [styles.show_search]: this.props.show_search
        })}
      >
        <textarea
          ref={(c) => this.cnt_node = c}
          defaultValue={this.props.code || ''}
        />
      </div>
    )
  }
}
