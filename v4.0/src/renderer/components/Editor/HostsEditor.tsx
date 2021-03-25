/**
 * HostsEditor
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import StatusBar from '@renderer/components/StatusBar'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@root/common/data'
import clsx from 'clsx'
import CodeMirror from 'codemirror'
import 'codemirror/addon/comment/comment'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import modeHosts from './cm_hl'
// import 'codemirror/lib/codemirror.css'
import './codemirror.less'
import styles from './HostsEditor.less'

modeHosts()

interface Props {
  hosts: {
    id: string;
    content?: string;
  };
}

const HostsEditor = (props: Props) => {
  const { hosts } = props
  const { hosts_data, isReadOnly } = useModel('useHostsData')
  const [hosts_id, setHostsId] = useState(hosts.id)
  const [content, setContent] = useState(hosts.content || '')
  const [cm_editor, setCMEditor] = useState<CodeMirror.EditorFromTextArea | null>(null)
  const el_ref = useRef<HTMLTextAreaElement>(null)

  let is_read_only = isReadOnly(hosts)

  const loadContent = async () => {
    if (!cm_editor) return

    let content = hosts.id === '0' ? await actions.getSystemHosts() : await actions.getHostsContent(hosts.id)
    setContent(content)
    cm_editor.setValue(content)
    cm_editor.setOption('readOnly', isReadOnly(hosts))
  }

  useEffect(() => {
    loadContent()
  }, [hosts_id, cm_editor])

  useEffect(() => {
    if (cm_editor && hosts_id !== hosts.id) {
      setTimeout(() => cm_editor.clearHistory(), 300)
    }

    setHostsId(hosts.id)
  }, [hosts])

  const toSave = lodash.debounce((id: string, content: string) => {
    actions.setHostsContent(id, content)
      .then(() => agent.broadcast('hosts_content_changed', id))
      .catch(e => console.error(e))
  }, 1000)

  const onChange = (content: string) => {
    setContent(content)
    toSave(hosts.id, content)
  }

  const toggleComment = () => {
    if (is_read_only || !cm_editor) return
    cm_editor.toggleComment()
  }

  const onGutterClick = (n: number) => {
    if (is_read_only || !cm_editor) return

    let info = cm_editor.lineInfo(n)
    let line = info.text
    if (/^\s*$/.test(line)) return

    let new_line: string
    if (/^#/.test(line)) {
      new_line = line.replace(/^#\s*/, '')
    } else {
      new_line = '# ' + line
    }

    cm_editor.getDoc()
      .replaceRange(
        new_line,
        { line: info.line, ch: 0 },
        { line: info.line, ch: line.length },
      )
  }

  useEffect(() => {
    if (!el_ref.current) return

    let cm = CodeMirror.fromTextArea(el_ref.current, {
      lineNumbers: true,
      readOnly: is_read_only,
      mode: 'hosts',
    })
    setCMEditor(cm)

    cm.setSize('100%', '100%')

    cm.on('change', (editor) => {
      let value = editor.getDoc().getValue()
      agent.broadcast('editor:content_change', value)
    })

    cm.on('gutterClick', (cm, n) => {
      agent.broadcast('editor:gutter_click', n)
    })
  }, [])

  useOnBroadcast('editor:content_change', (new_content: string) => {
    if (new_content === content) return
    onChange(new_content)
  }, [hosts, hosts_id, content])

  useOnBroadcast('editor:gutter_click', onGutterClick, [cm_editor])

  useOnBroadcast('hosts_refreshed', (h: IHostsListObject) => {
    if (hosts.id !== '0' && h.id !== hosts.id) return
    loadContent()
  }, [hosts, hosts_data, cm_editor])

  useOnBroadcast('toggle_comment', toggleComment, [hosts, cm_editor])

  useOnBroadcast('set_hosts_on_status', () => {
    if (hosts.id === '0') {
      loadContent()
    }
  }, [hosts, cm_editor])

  return (
    <div className={styles.root}>
      <div
        className={clsx(styles.editor, is_read_only && styles.read_only)}
      >
        <textarea
          ref={el_ref}
          defaultValue={content}
          // onChange={e => onChange(e.target.value)}
          // disabled={is_read_only}
        />
      </div>

      <StatusBar
        line_count={content.split('\n').length}
        read_only={is_read_only}
      />
    </div>
  )
}

export default HostsEditor
