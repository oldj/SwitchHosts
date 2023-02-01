/**
 * HostsEditor
 * @author: oldj
 * @homepage: https://oldj.net
 */

import StatusBar from '@renderer/components/StatusBar'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { IFindShowSourceParam } from '@common/types'
import wait from '@common/utils/wait'
import { useDebounceFn } from 'ahooks'
import clsx from 'clsx'
import CodeMirror from 'codemirror'
import 'codemirror/addon/comment/comment'
import 'codemirror/addon/selection/mark-selection'
import React, { useEffect, useRef, useState } from 'react'
import modeHosts from './cm_hl'
import './codemirror.module.scss'
import styles from './HostsEditor.module.scss'
import useHostsData from '@renderer/models/useHostsData'

modeHosts()

const HostsEditor = () => {
  const { current_hosts, hosts_data, isReadOnly } = useHostsData()
  const [hosts_id, setHostsId] = useState(current_hosts?.id || '0')
  const [content, setContent] = useState('')
  const [is_read_only, setIsReadOnly] = useState(true)
  const [find_params, setFindParams] = useState<IFindShowSourceParam | null>(null)
  const ref_el = useRef<HTMLTextAreaElement>(null)
  const ref_cm = useRef<CodeMirror.EditorFromTextArea | null>(null)

  const loadContent = async (is_new = false) => {
    let cm_editor = ref_cm.current
    if (!cm_editor) {
      setTimeout(loadContent, 100)
      return
    }

    let content =
      hosts_id === '0' ? await actions.getSystemHosts() : await actions.getHostsContent(hosts_id)
    setContent(content)
    cm_editor.setValue(content)
    if (is_new) {
      cm_editor.clearHistory()
    }
  }

  useEffect(() => {
    // console.log(current_hosts)
    setHostsId(current_hosts?.id || '0')
    let is_readonly = isReadOnly(current_hosts)
    setIsReadOnly(is_readonly)
    if (ref_cm.current) {
      ref_cm.current.setOption('readOnly', is_readonly)
    }
  }, [current_hosts])

  useEffect(() => {
    console.log(hosts_id)
    loadContent(true).catch((e) => console.error(e))
  }, [hosts_id])

  const { run: toSave } = useDebounceFn(
    (id: string, content: string) => {
      actions
        .setHostsContent(id, content)
        .then(() => agent.broadcast(events.hosts_content_changed, id))
        .catch((e) => console.error(e))
    },
    { wait: 1000 },
  )

  const onChange = (content: string) => {
    setContent(content)
    toSave(hosts_id, content)
  }

  const toggleComment = () => {
    let cm_editor = ref_cm.current
    if (is_read_only || !cm_editor) return
    cm_editor.toggleComment()

    // 光标移到下一行
    let cursor = cm_editor.getCursor()
    cursor.line += 1
    cm_editor.setCursor(cursor)
  }

  const onGutterClick = (n: number) => {
    let cm_editor = ref_cm.current
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

    cm_editor
      .getDoc()
      .replaceRange(new_line, { line: info.line, ch: 0 }, { line: info.line, ch: line.length })
  }

  useEffect(() => {
    if (!ref_el.current) return

    let cm = CodeMirror.fromTextArea(ref_el.current, {
      lineNumbers: true,
      readOnly: is_read_only,
      mode: 'hosts',
    })
    ref_cm.current = cm

    cm.setSize('100%', '100%')

    cm.on('change', (editor) => {
      let value = editor.getDoc().getValue()
      agent.broadcast(events.editor_content_change, value)
    })

    cm.on('gutterClick', (cm, n) => {
      agent.broadcast(events.editor_gutter_click, n)
    })
  }, [])

  useEffect(() => {
    if (find_params && find_params.item_id === hosts_id) {
      setSelection(find_params, true).catch((e) => console.error(e))
    }
  }, [hosts_id, find_params])

  useOnBroadcast(
    events.editor_content_change,
    (new_content: string) => {
      if (new_content === content) return
      onChange(new_content)
    },
    [hosts_id, content],
  )

  useOnBroadcast(
    events.hosts_refreshed,
    (h: IHostsListObject) => {
      if (hosts_id !== '0' && h.id !== hosts_id) return
      loadContent().catch((e) => console.error(e))
    },
    [hosts_id],
  )

  useOnBroadcast(
    events.hosts_refreshed_by_id,
    (id: string) => {
      if (hosts_id !== '0' && hosts_id !== id) return
      loadContent().catch((e) => console.error(e))
    },
    [hosts_id, hosts_data],
  )

  useOnBroadcast(
    events.set_hosts_on_status,
    () => {
      if (hosts_id === '0') {
        loadContent().catch((e) => console.error(e))
      }
    },
    [hosts_id],
  )

  useOnBroadcast(
    events.system_hosts_updated,
    () => {
      if (hosts_id === '0') {
        loadContent().catch((e) => console.error(e))
      }
    },
    [hosts_id],
  )

  useOnBroadcast(events.editor_gutter_click, onGutterClick, [is_read_only])
  useOnBroadcast(events.toggle_comment, toggleComment, [is_read_only])

  const setSelection = async (params: IFindShowSourceParam, repeat = false) => {
    let cm_editor = ref_cm.current
    if (!cm_editor) return
    let doc = cm_editor.getDoc()

    doc.setSelection(
      {
        line: params.line - 1,
        ch: params.line_pos,
      },
      {
        line: params.end_line - 1,
        ch: params.end_line_pos,
      },
    )

    // console.log(doc.getSelection())
    await wait(200)
    if (!doc.getSelection()) {
      await setSelection(params)
    }
    cm_editor.focus()
  }

  useOnBroadcast(
    events.show_source,
    async (params: IFindShowSourceParam) => {
      if (!ref_cm.current) return

      if (params.item_id !== hosts_id) {
        setFindParams(params)
        setTimeout(() => {
          setFindParams(null)
        }, 3000)
        return
      }

      setSelection(params).catch((e) => console.error(e))
    },
    [hosts_id],
  )

  return (
    <div className={styles.root}>
      <div className={clsx(styles.editor, is_read_only && styles.read_only)}>
        <textarea
          ref={ref_el}
          defaultValue={content}
          // onChange={e => onChange(e.target.value)}
          // disabled={is_read_only}
        />
      </div>

      <StatusBar
        line_count={content.split('\n').length}
        bytes={content.length}
        read_only={is_read_only}
      />
    </div>
  )
}

export default HostsEditor
