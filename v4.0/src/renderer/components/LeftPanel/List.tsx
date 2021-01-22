/**
 * List
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { actions, agent } from '@renderer/agent'
import ListItem from '@renderer/components/LeftPanel/ListItem'
import SystemHostsItem from '@renderer/components/LeftPanel/SystemHostsItem'
import useOnBroadcast from '@renderer/libs/hooks/useOnBroadcast'
import { getHostsOutput, updateOneItem } from '@root/common/hostsFn'
import React from 'react'
import styles from './List.less'

interface Props {
}

const List = (props: Props) => {
  const { hosts_data, getData, setList } = useModel('useHostsData')
  const { i18n } = useModel('useI18n')

  const onToggleItem = async (id: string, on: boolean) => {
    const new_list = updateOneItem(hosts_data.list, { id, on })

    const content = getHostsOutput(new_list)
    const result = await actions.systemHostsWrite(content)
    if (result.success) {
      setList(new_list).catch(e => console.error(e))
      new Notification(i18n.lang.success, {
        body: i18n.lang.hosts_updated,
      })

    } else {
      console.log(result)
      getData().catch(e => console.log(e))

      let body = i18n.lang.no_access_to_hosts
      if (result.code !== 'no_access') {
        body = result.message || 'Unknow error!'
      }

      new Notification(i18n.lang.fail, {
        body,
      })

      agent.broadcast('set_hosts_on_status', id, !on)
    }
  }

  useOnBroadcast('toggle_item', onToggleItem, [hosts_data])

  return (
    <div className={styles.root}>
      <SystemHostsItem/>
      {hosts_data.list?.map(item => (
        <ListItem data={item} key={item.id}/>
      ))}
    </div>
  )
}

export default List
