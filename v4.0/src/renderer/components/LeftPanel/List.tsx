/**
 * List
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { RightOutlined } from '@ant-design/icons'
import ItemIcon from '@renderer/components/ItemIcon'
import ListItem from '@renderer/components/LeftPanel/ListItem'
import { Tree } from '@renderer/components/Tree'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { HostsListObjectType } from '@root/common/data'
import { findItemById, getHostsOutput, getNextSelectedItem, updateOneItem } from '@root/common/hostsFn'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import styles from './List.less'

interface Props {
}

const List = (props: Props) => {
  const { current_hosts, setCurrentHosts } = useModel('useCurrentHosts')
  const { hosts_data, getHostsData, setList } = useModel('useHostsData')
  const { i18n, lang } = useModel('useI18n')
  const [show_list, setShowList] = useState<HostsListObjectType[]>([])

  useEffect(() => {
    setShowList([{
      id: '0',
      title: lang.system_hosts,
      is_sys: true,
    }, ...hosts_data.list])
  }, [hosts_data])

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

  useOnBroadcast('move_to_trashcan', async (id: string) => {
    console.log(`move_to_trashcan: #${id}`)

    let next_hosts: HostsListObjectType | undefined
    // console.log(current_hosts)
    if (current_hosts && current_hosts.id === id) {
      next_hosts = getNextSelectedItem(hosts_data.list, id)
      // console.log(next_hosts)
    }

    await actions.localListItemMoveToTrashcan(id)
    await getHostsData()

    if (next_hosts) {
      await setCurrentHosts(next_hosts)
    }
  }, [current_hosts, hosts_data])

  useOnBroadcast('select_hosts', async (id: string, wait_ms: number = 0) => {
    let hosts = findItemById(hosts_data.list, id)
    if (!hosts) {
      if (wait_ms > 0) {
        setTimeout(() => {
          agent.broadcast('select_hosts', id, wait_ms - 50)
        }, 50)
      }
      return
    }

    setCurrentHosts(hosts)
  }, [hosts_data])

  return (
    <div className={styles.root}>
      {/*<SystemHostsItem/>*/}
      <Tree
        data={show_list}
        selected_id={current_hosts?.id || '0'}
        onChange={list => {
          setShowList(list)
          setList(list).catch(e => console.error(e))
        }}
        onSelect={(id) => {
          agent.broadcast('select_hosts', id)
        }}
        nodeRender={(data) => (
          <ListItem key={data.id} data={data}/>
        )}
        collapseArrow={<RightOutlined/>}
        nodeAttr={(item) => {
          return {
            can_drag: !item.is_sys,
            can_drop_before: !item.is_sys,
            can_drop_in: item.where === 'folder',
            can_drop_after: !item.is_sys,
          }
        }}
        draggingNodeRender={(data) => {
          return (
            <div className={clsx(styles.for_drag)}>
              <span
                className={clsx(styles.icon, data.where === 'folder' && styles.folder)}
              >
                <ItemIcon where={data.is_sys ? 'system' : data.where} is_collapsed={data.is_collapsed}/>
              </span>
              <span>
                {data.title || lang.untitled}
              </span>
            </div>
          )
        }}
        nodeClassName={styles.node}
        nodeDropInClassName={styles.node_drop_in}
        nodeSelectedClassName={styles.node_selected}
        nodeCollapseArrowClassName={styles.arrow}
      />
    </div>
  )
}

export default List
