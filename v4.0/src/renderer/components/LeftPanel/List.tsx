/**
 * List
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { RightOutlined } from '@ant-design/icons'
import ListItem from '@renderer/components/LeftPanel/ListItem'
import SystemHostsItem from '@renderer/components/LeftPanel/SystemHostsItem'
import { Tree } from '@renderer/components/Tree'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { HostsListObjectType } from '@root/common/data'
import { getHostsOutput, getNextSelectedItem, updateOneItem } from '@root/common/hostsFn'
import React, { useState } from 'react'
import styles from './List.less'

interface Props {
}

const List = (props: Props) => {
  const { current_hosts, setCurrentHosts } = useModel('useCurrentHosts')
  const { hosts_data, getHostsData, setList } = useModel('useHostsData')
  const { i18n } = useModel('useI18n')
  const [show_list, setShowList] = useState(hosts_data.list)

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
      getHostsData().catch(e => console.log(e))

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

  useOnBroadcast('delete_hosts', async (id: string) => {
    console.log(`delete_hosts: #${id}`)

    let next_hosts: HostsListObjectType | undefined
    console.log(current_hosts)
    if (current_hosts && current_hosts.id === id) {
      next_hosts = getNextSelectedItem(hosts_data.list, id)
      console.log(next_hosts)
    }

    await actions.localListDeleteItem(id)
    await getHostsData()

    if (next_hosts) {
      await setCurrentHosts(next_hosts)
    }
  }, [current_hosts, hosts_data])

  return (
    <div className={styles.root}>
      <SystemHostsItem/>
      <Tree
        data={show_list}
        onChange={list => {
          setShowList(list)
          setList(list).catch(e => console.error(e))
        }}
        nodeRender={(data) => (
          <ListItem key={data.id} data={data}/>
        )}
        collapseArrow={<RightOutlined/>}
        nodeAttr={(item) => {
          return {
            can_drop_in: item.where === 'folder',
          }
        }}
        draggingNodeRender={(data) => {
          return (
            <div style={{
              border: '1px solid #999',
              background: '#fff',
              padding: '4px 8px',
            }}>
              111:{data.title || `#${data.id}`}
            </div>
          )
        }}
        nodeClassName={styles.node}
        nodeSelectedClassName={styles.node_selected}
        nodeCollapseArrowClassName={styles.arrow}
        selected_id={current_hosts?.id}
      />
    </div>
  )
}

export default List
