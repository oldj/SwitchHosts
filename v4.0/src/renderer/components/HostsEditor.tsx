/**
 * HostsEditor
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
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

  return (
    <div className={styles.root}>
      <textarea value={content} onChange={e => onChange(e.target.value)}/>
    </div>
  )
}

export default HostsEditor
