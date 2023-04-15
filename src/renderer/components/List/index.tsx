/**
 * List
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Center, useToast } from '@chakra-ui/react'
import { IHostsWriteOptions } from '@main/types'
import ItemIcon from '@renderer/components/ItemIcon'
import { Tree } from '@renderer/components/Tree'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { findItemById, getNextSelectedItem, setOnStateOfItem } from '@common/hostsFn'
import { IFindShowSourceParam } from '@common/types'
import useI18n from '@renderer/models/useI18n'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import { BiChevronRight } from 'react-icons/bi'
import styles from './index.module.scss'
import ListItem from './ListItem'
import useConfigs from '@renderer/models/useConfigs'
import useHostsData from '@renderer/models/useHostsData'

interface Props {
  is_tray?: boolean
}

const List = (props: Props) => {
  const { is_tray } = props
  const { hosts_data, loadHostsData, setList, current_hosts, setCurrentHosts } = useHostsData()
  const { configs } = useConfigs()
  const { lang } = useI18n()
  const [selected_ids, setSelectedIds] = useState<string[]>([current_hosts?.id || '0'])
  const [show_list, setShowList] = useState<IHostsListObject[]>([])
  const toast = useToast()

  useEffect(() => {
    if (!is_tray) {
      setShowList([
        {
          id: '0',
          title: lang.system_hosts,
          is_sys: true,
        },
        ...hosts_data.list,
      ])
    } else {
      setShowList([...hosts_data.list])
    }
  }, [hosts_data])

  const onToggleItem = async (id: string, on: boolean) => {
    console.log(`writeMode: ${configs?.write_mode}`)
    console.log(`toggle hosts #${id} as ${on ? 'on' : 'off'}`)

    if (!configs?.write_mode) {
      agent.broadcast(events.show_set_write_mode, { id, on })
      return
    }

    const new_list = setOnStateOfItem(
      hosts_data.list,
      id,
      on,
      configs?.choice_mode ?? 0,
      configs?.multi_chose_folder_switch_all ?? false,
    )
    let success = await writeHostsToSystem(new_list)
    if (success) {
      toast({
        status: 'success',
        description: lang.success,
        isClosable: true,
      })
      agent.broadcast(events.set_hosts_on_status, id, on)
    } else {
      agent.broadcast(events.set_hosts_on_status, id, !on)
    }
  }

  const writeHostsToSystem = async (
    list?: IHostsListObject[],
    options?: IHostsWriteOptions,
  ): Promise<boolean> => {
    if (!Array.isArray(list)) {
      list = hosts_data.list
    }

    let content: string = await actions.getContentOfList(list)
    const result = await actions.setSystemHosts(content, options)
    if (result.success) {
      setList(list).catch((e) => console.error(e))
      // new Notification(lang.success, {
      //   body: lang.hosts_updated,
      // })

      if (current_hosts) {
        let hosts = findItemById(list, current_hosts.id)
        if (hosts) {
          agent.broadcast(events.set_hosts_on_status, current_hosts.id, hosts.on)
        }
      }
    } else {
      console.log(result)
      loadHostsData().catch((e) => console.log(e))
      let err_desc = lang.fail

      // let body: string = lang.no_access_to_hosts
      if (result.code === 'no_access') {
        if (agent.platform === 'darwin' || agent.platform === 'linux') {
          agent.broadcast(events.show_sudo_password_input, list)
        }
        // } else {
        // body = result.message || 'Unknown error!'
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

    agent.broadcast(events.tray_list_updated)

    return result.success
  }

  if (!is_tray) {
    useOnBroadcast(events.toggle_item, onToggleItem, [hosts_data, configs])
    useOnBroadcast(events.write_hosts_to_system, writeHostsToSystem, [hosts_data])
  } else {
    useOnBroadcast(events.tray_list_updated, loadHostsData)
  }

  useOnBroadcast(
    events.move_to_trashcan,
    async (ids: string[]) => {
      console.log(`move_to_trashcan: #${ids}`)
      await actions.moveManyToTrashcan(ids)
      await loadHostsData()

      if (current_hosts && ids.includes(current_hosts.id)) {
        // 选中删除指定节点后的兄弟节点
        let next_item = getNextSelectedItem(hosts_data.list, (i) => ids.includes(i.id))
        setCurrentHosts(next_item || null)
        setSelectedIds(next_item ? [next_item.id] : [])
      }
    },
    [current_hosts, hosts_data],
  )

  useOnBroadcast(
    events.select_hosts,
    async (id: string, wait_ms: number = 0) => {
      let hosts = findItemById(hosts_data.list, id)
      if (!hosts) {
        if (wait_ms > 0) {
          setTimeout(() => {
            agent.broadcast(events.select_hosts, id, wait_ms - 50)
          }, 50)
        }
        return
      }

      setCurrentHosts(hosts)
      setSelectedIds([id])
    },
    [hosts_data],
  )

  useOnBroadcast(events.reload_list, loadHostsData)

  useOnBroadcast(events.hosts_content_changed, async (hosts_id: string) => {
    let list: IHostsListObject[] = await actions.getList()
    let hosts = findItemById(list, hosts_id)
    if (!hosts || !hosts.on) return

    // 当前 hosts 是开启状态，且内容发生了变化
    await writeHostsToSystem(list)
  })

  useOnBroadcast(events.show_source, async (params: IFindShowSourceParam) => {
    agent.broadcast(events.select_hosts, params.item_id)
  })

  return (
    <div className={styles.root}>
      {/*<SystemHostsItem/>*/}
      <Tree
        data={show_list}
        selected_ids={selected_ids}
        onChange={(list) => {
          setShowList(list)
          setList(list).catch((e) => console.error(e))
        }}
        onSelect={(ids: string[]) => {
          // console.log(ids)
          setSelectedIds(ids)
        }}
        nodeRender={(data) => (
          <ListItem key={data.id} data={data} is_tray={is_tray} selected_ids={selected_ids} />
        )}
        collapseArrow={
          <Center w="20px" h="20px">
            <BiChevronRight />
          </Center>
        }
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
                {selected_ids.length > 1 ? (
                  <span className={styles.items_count}>
                    {selected_ids.length} {lang.items}
                  </span>
                ) : null}
              </span>
            </div>
          )
        }}
        nodeClassName={styles.node}
        nodeDropInClassName={styles.node_drop_in}
        nodeSelectedClassName={styles.node_selected}
        nodeCollapseArrowClassName={styles.arrow}
        allowed_multiple_selection={true}
      />
    </div>
  )
}

export default List
