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
import lodash from 'lodash'
import React, { useEffect, useState } from 'react'
import styles from './HostsEditor.less'

interface Props {
  hosts: IHostsListObject;
}

const HostsEditor = (props: Props) => {
  const { hosts } = props
  const { hosts_data, isHostsInTrashcan } = useModel('useHostsData')
  const [ hosts_id, setHostsId ] = useState(hosts.id)
  const [ content, setContent ] = useState(hosts.content || '')

  useEffect(() => {
    setHostsId(hosts.id)
    // setContent(getContentOfHosts(hosts_data.list, hosts))
    actions.getHostsContent(hosts.id)
      .then(setContent)
  }, [ hosts ])

  const toSave = lodash.debounce((id: string, content: string) => {
    actions.setHostsContent(id, content)
      .then(() => agent.broadcast('hosts_content_changed', id))
      .catch(e => console.error(e))
  }, 1000)

  const onChange = (content: string) => {
    setContent(content)
    toSave(hosts_id, content)
  }

  const isReadOnly = (): boolean => {
    if (!hosts) {
      return true
    }

    if (hosts.type && ([ 'group', 'remote', 'folder', 'trashcan' ]).includes(hosts.type)) {
      return true
    }

    if (isHostsInTrashcan(hosts.id)) {
      return true
    }

    // ..
    return false
  }

  let is_read_only = isReadOnly()

  useOnBroadcast('hosts_refreshed', (h: IHostsListObject) => {
    if (h.id !== hosts.id) return
    actions.getHostsContent(hosts.id)
      .then(setContent)
  }, [ hosts, hosts_data ])

  return (
    <div className={styles.root}>
      <div className={styles.editor}>
        <textarea
          value={content}
          onChange={e => onChange(e.target.value)}
          disabled={is_read_only}
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
