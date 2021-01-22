/**
 * List
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { actions } from '@renderer/agent'
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

  const onToggleItem = (id: string, on: boolean) => {
    const new_list = updateOneItem(hosts_data.list, { id, on })
    // setList(new_list)
    //   .catch(e => console.error(e))

    const content = getHostsOutput(new_list)
    actions.systemHostsWrite(content)
      .then((result) => {
        if (result.success) {
          setList(new_list).catch(e => console.error(e))
        } else {
          console.log(result)
          getData().catch(e => console.log(e))
        }
      })
      .catch(e => console.error(e))
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
