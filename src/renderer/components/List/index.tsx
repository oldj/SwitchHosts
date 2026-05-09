/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { IHostsListObject } from '@common/data'
import events from '@common/events'
import { findItemById, flatten, getNextSelectedItem, setOnStateOfItem } from '@common/hostsFn'
import { IFindShowSourceParam } from '@common/types'
import ItemIcon from '@renderer/components/ItemIcon'
import { Tree } from '@renderer/components/Tree'
import { actions, agent } from '@renderer/core/agent'
import { showErrorNotification } from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { BiChevronRight } from 'react-icons/bi'
import styles from './index.module.scss'
import ListItem from './ListItem'

interface Props {
  isTray?: boolean
}

const List = (props: Props) => {
  const { isTray } = props
  const { hostsData, loadHostsData, setList, currentHosts, setCurrentHosts } = useHostsData()
  const { configs } = useConfigs()
  const { lang } = useI18n()
  const [selectedIds, setSelectedIds] = useState<string[]>(
    isTray ? [] : [currentHosts?.id || '0'],
  )
  const [showList, setShowList] = useState<IHostsListObject[]>([])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- showList also mutated by drag onChange; keep as state synced from hostsData */
    if (!isTray) {
      setShowList([
        {
          id: '0',
          title: lang.system_hosts,
          is_sys: true,
        },
        ...hostsData.list,
      ])
    } else {
      setShowList([...hostsData.list])
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostsData])

  useEffect(() => {
    if (isTray || !currentHosts) return
    if (!hostsData.trashcan.find((item) => item.data.id === currentHosts.id)) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear selection when current item moves to trashcan
    setSelectedIds([])
  }, [currentHosts, hostsData.trashcan, isTray])

  const onToggleItem = async (id: string, on: boolean) => {
    console.log(`writeMode: ${configs?.write_mode}`)
    console.log(`toggle hosts #${id} as ${on ? 'on' : 'off'}`)

    if (!configs?.write_mode) {
      agent.broadcast(events.show_set_write_mode, { id, on })
      return
    }

    const newList = setOnStateOfItem(
      hostsData.list,
      id,
      on,
      configs?.choice_mode ?? 0,
      configs?.multi_chose_folder_switch_all ?? false,
    )
    const success = await writeHostsToSystem(newList)
    if (success) {
      console.log(lang.success)
      agent.broadcast(events.set_hosts_on_status, id, on)
    } else {
      agent.broadcast(events.set_hosts_on_status, id, !on)
    }
  }

  const writeHostsToSystem = async (list?: IHostsListObject[]): Promise<boolean> => {
    if (!Array.isArray(list)) {
      list = hostsData.list
    }

    const content: string = await actions.getContentOfList(list)
    const result = await actions.setSystemHosts(content)
    if (result.success) {
      try {
        await setList(list)
      } catch (e) {
        console.error(e)
      }

      if (currentHosts) {
        const hosts = findItemById(list, currentHosts.id)
        if (hosts) {
          agent.broadcast(events.set_hosts_on_status, currentHosts.id, hosts.on)
        }
      }
    } else {
      console.log(result)
      // `cancelled` means the user dismissed the OS auth prompt — that's
      // intentional, not an error worth a toast. Other failures surface
      // through the standard error notification.
      await loadHostsData().catch((e) => console.log(e))
      if (result.code !== 'cancelled') {
        const errDesc =
          result.code === 'no_access' ? lang.no_access_to_hosts : result.message || lang.fail
        showErrorNotification({ title: lang.fail, message: errDesc })
        console.error(errDesc)
      }
    }

    await agent.broadcast(events.tray_list_updated)

    return result.success
  }

  useOnBroadcast(
    events.toggle_item,
    (id: string, on: boolean) => {
      if (isTray) return
      onToggleItem(id, on)
    },
    [hostsData, configs, isTray],
  )
  useOnBroadcast(
    events.tray_list_updated,
    () => {
      if (!isTray) return
      loadHostsData()
    },
    [isTray],
  )

  useOnBroadcast(
    events.move_to_trashcan,
    async (ids: string[]) => {
      console.log(`move_to_trashcan: #${ids}`)
      await actions.moveManyToTrashcan(ids)
      await loadHostsData()

      if (currentHosts && ids.includes(currentHosts.id)) {
        // 选中删除指定节点后的兄弟节点
        const nextItem = getNextSelectedItem(hostsData.list, (i) => ids.includes(i.id))
        setCurrentHosts(nextItem || null)
        setSelectedIds(nextItem ? [nextItem.id] : [])
      }
    },
    [currentHosts, hostsData],
  )

  useOnBroadcast(
    events.select_hosts,
    async (id: string, waitMs: number = 0) => {
      if (isTray) return
      const hosts = findItemById(hostsData.list, id)
      if (!hosts) {
        if (waitMs > 0) {
          setTimeout(() => {
            agent.broadcast(events.select_hosts, id, waitMs - 50)
          }, 50)
        }
        return
      }

      setCurrentHosts(hosts)
      setSelectedIds([id])
    },
    [hostsData, isTray],
  )

  useOnBroadcast(events.reload_list, loadHostsData)

  useOnBroadcast(events.hosts_content_changed, async (hostsId: string) => {
    const list: IHostsListObject[] = await actions.getList()
    const hosts = findItemById(list, hostsId)
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
        data={showList}
        selectedIds={selectedIds}
        onChange={(list) => {
          setShowList(list)
          const newUserList = list.filter((i) => !i.is_sys)

          const enabledIdSeq = (l: IHostsListObject[]) =>
            flatten(l)
              .filter((i) => i.on)
              .map((i) => i.id)
              .join('\n')

          if (
            enabledIdSeq(hostsData.list) !== enabledIdSeq(newUserList) &&
            configs?.write_mode
          ) {
            writeHostsToSystem(newUserList).catch((e) => console.error(e))
          } else {
            setList(newUserList).catch((e) => console.error(e))
          }
        }}
        onSelect={(ids: string[]) => {
          if (isTray) return
          setSelectedIds(ids)
        }}
        nodeRender={(data) => (
          <ListItem key={data.id} data={data} isTray={isTray} selectedIds={selectedIds} />
        )}
        collapseArrow={
          <div
            style={{
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BiChevronRight />
          </div>
        }
        nodeAttr={(item) => {
          return {
            can_drag: !item.is_sys && !isTray,
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
                  isCollapsed={data.is_collapsed}
                />
              </span>
              <span>
                {data.title || lang.untitled}
                {selectedIds.length > 1 ? (
                  <span className={styles.items_count}>
                    {selectedIds.length} {lang.items}
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
        allowedMultipleSelection={true}
      />
    </div>
  )
}

export default List
