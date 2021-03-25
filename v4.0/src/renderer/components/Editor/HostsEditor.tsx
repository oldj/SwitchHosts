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
import CodeMirror from 'codemirror'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import modeHosts from './cm_hl'
import styles from './HostsEditor.less'
// import 'codemirror/lib/codemirror.css'
import './codemirror.less'

modeHosts()

interface Props {
  hosts: IHostsListObject;
}

const HostsEditor = (props: Props) => {
  const { hosts } = props
  const { hosts_data, isHostsInTrashcan } = useModel('useHostsData')
  const [hosts_id, setHostsId] = useState(hosts.id)
  const [content, setContent] = useState(hosts.content || '')
  const [cm_editor, setCMEditor] = useState<CodeMirror.EditorFromTextArea | null>(null)
  const el_ref = useRef<HTMLTextAreaElement>(null)

  const isReadOnly = (): boolean => {
    if (!hosts) {
      return true
    }

    if (hosts.type && (['group', 'remote', 'folder', 'trashcan']).includes(hosts.type)) {
      return true
    }

    if (isHostsInTrashcan(hosts.id)) {
      return true
    }

    // ..
    return false
  }

  let is_read_only = isReadOnly()

  const loadContent = async () => {
    if (!cm_editor) return

    let content = await actions.getHostsContent(hosts_id)
    setContent(content)
    cm_editor.setValue(content)
    cm_editor.setOption('readOnly', isReadOnly())
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
  }, [])

  useOnBroadcast('editor:content_change', (new_content: string) => {
    if (new_content === content) return
    onChange(new_content)
  }, [hosts, hosts_id, content])

  useOnBroadcast('hosts_refreshed', (h: IHostsListObject) => {
    if (h.id !== hosts.id) return
    loadContent()
  }, [hosts, hosts_data])

  return (
    <div className={styles.root}>
      <div className={styles.editor}>
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
