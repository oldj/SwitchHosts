/**
 * List
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { Center, useToast } from '@chakra-ui/react'
import { IHostsWriteOptions } from '@main/types'
import ItemIcon from '@renderer/components/ItemIcon'
import ListItem from '@renderer/components/LeftPanel/ListItem'
import { Tree } from '@renderer/components/Tree'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@root/common/data'
import { findItemById, flatten, getNextSelectedItem, updateOneItem } from '@root/common/hostsFn'
import normalize from '@root/common/normalize'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { BiChevronRight } from 'react-icons/bi'
import styles from './List.less'

interface Props {
}

const List = (props: Props) => {
  const {
    hosts_data,
    loadHostsData,
    setList,
    current_hosts,
    setCurrentHosts,
  } = useModel('useHostsData')
  const { lang } = useModel('useI18n')
  const [ show_list, setShowList ] = useState<IHostsListObject[]>([])
  const toast = useToast()

  useEffect(() => {
    setShowList([ {
      id: '0',
      title: lang.system_hosts,
      is_sys: true,
    }, ...hosts_data.list ])
  }, [ hosts_data ])

  const onToggleItem = async (id: string, on: boolean) => {
    const new_list = updateOneItem(hosts_data.list, { id, on })
    let success = await writeHostsToSystem(new_list)
    if (success) {
      toast({
        status: 'success',
        description: lang.success,
      })
    } else {
      agent.broadcast('set_hosts_on_status', id, !on)
    }
  }

  const writeHostsToSystem = async (list?: IHostsListObject[], options?: IHostsWriteOptions): Promise<boolean> => {
    if (!Array.isArray(list)) {
      list = hosts_data.list
    }

    const content_list: string[] = []
    const flat = flatten(list).filter(i => i.on)
    for (let hosts of flat) {
      let c = await actions.getHostsContent(hosts.id)
      content_list.push(c)
    }

    let content = content_list.join('\n\n')
    // console.log(content)
    content = normalize(content)

    const result = await actions.setSystemHosts(content, options)
    if (result.success) {
      setList(list).catch(e => console.error(e))
      new Notification(lang.success, {
        body: lang.hosts_updated,
      })

      if (current_hosts) {
        let hosts = findItemById(list, current_hosts.id)
        if (hosts) {
          agent.broadcast('set_hosts_on_status', current_hosts.id, hosts.on)
        }
      }

    } else {
      console.log(result)
      loadHostsData().catch(e => console.log(e))

      let body: string = lang.no_access_to_hosts
      if (result.code === 'no_access') {
        if (agent.platform === 'darwin' || agent.platform === 'linux') {
          agent.broadcast('show_sudo_password_input', list)
        }
      } else {
        body = result.message || 'Unknow error!'
      }

      new Notification(lang.fail, {
        body,
      })
      toast({
        status: 'error',
        description: lang.fail,
      })
    }

    return result.success
  }

  useOnBroadcast('toggle_item', onToggleItem, [ hosts_data ])
  useOnBroadcast('write_hosts_to_system', writeHostsToSystem, [ hosts_data ])

  useOnBroadcast('move_to_trashcan', async (id: string) => {
    console.log(`move_to_trashcan: #${id}`)

    let next_hosts: IHostsListObject | undefined
    // console.log(current_hosts)
    if (current_hosts && current_hosts.id === id) {
      next_hosts = getNextSelectedItem(hosts_data.list, id)
      // console.log(next_hosts)
    }

    await actions.moveToTrashcan(id)
    await loadHostsData()

    if (next_hosts) {
      await setCurrentHosts(next_hosts)
    }
  }, [ current_hosts, hosts_data ])

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
  }, [ hosts_data ])

  useOnBroadcast('reload_list', loadHostsData)

  useOnBroadcast('hosts_content_changed', async (hosts_id: string) => {
    let list: IHostsListObject[] = await actions.getList()
    let hosts = findItemById(list, hosts_id)
    if (!hosts || !hosts.on) return

    // 当前 hosts 是开启状态，且内容发生了变化
    await writeHostsToSystem(list)
  })

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
        // onSelect={(id) => {
        //   agent.broadcast('select_hosts', id)
        //}}
        nodeRender={(data) => (
          <ListItem key={data.id} data={data}/>
        )}
        collapseArrow={<Center w="20px" h="20px"><BiChevronRight/></Center>}
        nodeAttr={(item) => {
          return {
            can_drag: !item.is_sys,
            can_drop_before: !item.is_sys,
            can_drop_in: item.type === 'folder',
            can_drop_after: !item.is_sys,
          }
        }}
        draggingNodeRender={(data) => {
          return (
            <div className={clsx(styles.for_drag)}>
              <span
                className={clsx(styles.icon, data.type === 'folder' && styles.folder)}
              >
                <ItemIcon type={data.is_sys ? 'system' : data.type}
                          is_collapsed={data.is_collapsed}/>
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
