/**
 * List
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { Center, useToast } from '@chakra-ui/react'
import { IHostsWriteOptions } from '@main/types'
import ItemIcon from '@renderer/components/ItemIcon'
import { Tree } from '@renderer/components/Tree'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@root/common/data'
import { findItemById, getNextSelectedItem, setOnStateOfItem } from '@root/common/hostsFn'
import { IFindShowSourceParam } from '@root/common/types'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { BiChevronRight } from 'react-icons/bi'
import styles from './index.less'
import ListItem from './ListItem'

interface Props {
  is_tray?: boolean;
}

const List = (props: Props) => {
  const { is_tray } = props
  const {
    hosts_data,
    loadHostsData,
    setList,
    current_hosts,
    setCurrentHosts,
  } = useModel('useHostsData')
  const { configs } = useModel('useConfigs')
  const { lang } = useModel('useI18n')
  const [show_list, setShowList] = useState<IHostsListObject[]>([])
  const toast = useToast()

  useEffect(() => {
    if (!is_tray) {
      setShowList([{
        id: '0',
        title: lang.system_hosts,
        is_sys: true,
      }, ...hosts_data.list])
    } else {
      setShowList([...hosts_data.list])
    }
  }, [hosts_data])

  const onToggleItem = async (id: string, on: boolean) => {
    console.log(`toggle hosts #${id} as ${on ? 'on' : 'off'}`)
    const new_list = setOnStateOfItem(hosts_data.list, id, on, configs?.choice_mode ?? 0)
    let success = await writeHostsToSystem(new_list)
    if (success) {
      toast({
        status: 'success',
        description: lang.success,
        isClosable: true,
      })
      agent.broadcast('set_hosts_on_status', id, on)
    } else {
      agent.broadcast('set_hosts_on_status', id, !on)
    }
  }

  const writeHostsToSystem = async (list?: IHostsListObject[], options?: IHostsWriteOptions): Promise<boolean> => {
    if (!Array.isArray(list)) {
      list = hosts_data.list
    }

    let content: string = await actions.getContentOfList(list)
    const result = await actions.setSystemHosts(content, options)
    if (result.success) {
      setList(list).catch(e => console.error(e))
      // new Notification(lang.success, {
      //   body: lang.hosts_updated,
      // })

      if (current_hosts) {
        let hosts = findItemById(list, current_hosts.id)
        if (hosts) {
          agent.broadcast('set_hosts_on_status', current_hosts.id, hosts.on)
        }
      }

    } else {
      console.log(result)
      loadHostsData().catch(e => console.log(e))
      let err_desc = lang.fail

      // let body: string = lang.no_access_to_hosts
      if (result.code === 'no_access') {
        if (agent.platform === 'darwin' || agent.platform === 'linux') {
          agent.broadcast('show_sudo_password_input', list)
        }
        // } else {
        // body = result.message || 'Unknow error!'
        err_desc = lang.no_access_to_hosts
      }

      // new Notification(lang.fail, {
      //   body,
      // })
      toast({
        status: 'error',
        description: err_desc,
        isClosable: true,
      })
    }

    agent.broadcast('tray:list_updated')

    return result.success
  }

  if (!is_tray) {
    useOnBroadcast('toggle_item', onToggleItem, [hosts_data])
    useOnBroadcast('write_hosts_to_system', writeHostsToSystem, [hosts_data])
  } else {
    useOnBroadcast('tray:list_updated', loadHostsData)
  }

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

  useOnBroadcast('reload_list', loadHostsData)

  useOnBroadcast('hosts_content_changed', async (hosts_id: string) => {
    let list: IHostsListObject[] = await actions.getList()
    let hosts = findItemById(list, hosts_id)
    if (!hosts || !hosts.on) return

    // 当前 hosts 是开启状态，且内容发生了变化
    await writeHostsToSystem(list)
  })

  useOnBroadcast('show_source', async (params: IFindShowSourceParam) => {
    agent.broadcast('select_hosts', params.item_id)
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
          <ListItem key={data.id} data={data} is_tray={is_tray}/>
        )}
        collapseArrow={<Center w="20px" h="20px"><BiChevronRight/></Center>}
        nodeAttr={(item) => {
          return {
            can_drag: !item.is_sys && !is_tray,
            can_drop_before: !item.is_sys,
            can_drop_in: item.type === 'folder',
            can_drop_after: !item.is_sys,
          }
        }}
        draggingNodeRender={(data) => {
          return (
            <div className={clsx(styles.for_drag)}>
              <span className={clsx(styles.icon, data.type === 'folder' && styles.folder)}>
                <ItemIcon
                  type={data.is_sys ? 'system' : data.type}
                  is_collapsed={data.is_collapsed}
                />
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
