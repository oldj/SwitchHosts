/**
 * HostsEditor
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import StatusBar from '@renderer/components/StatusBar'
import { updateOneItem } from '@renderer/libs/hostsFn'
import { HostsObjectType } from '@root/common/data'
import lodash from 'lodash'
import React, { useEffect, useState } from 'react'
import styles from './HostsEditor.less'

interface Props {
  hosts: HostsObjectType;
}

const HostsEditor = (props: Props) => {
  const { hosts } = props
  const { i18n } = useModel('useI18n')
  const { hosts_data, setList } = useModel('useHostsData')
  const [hosts_id, setHostsId] = useState(hosts.id)
  const [content, setContent] = useState(hosts.content || '')

  useEffect(() => {
    setHostsId(hosts.id)
    setContent(hosts.content || '')
  }, [hosts])

  const toSave = lodash.debounce((id: string, content: string) => {
    setList(updateOneItem(hosts_data.list, { id, content }))
      .catch(e => console.error(e))
  }, 1000)

  const onChange = (content: string) => {
    setContent(content)
    toSave(hosts_id, content)
  }

  let is_read_only = !hosts || (['group', 'remote', 'folder']).includes(hosts.where)

  return (
    <div className={styles.root}>
      <div className={styles.editor}>
        <textarea value={content} onChange={e => onChange(e.target.value)}/>
      </div>

      <StatusBar
        line_count={content.split('\n').length}
        read_only={is_read_only}
      />
    </div>
  )
}

export default HostsEditor
