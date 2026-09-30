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
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { BiChevronRight } from 'react-icons/bi'
import styles from './index.module.scss'
import ListItem from './ListItem'

interface Props {
  isTray?: boolean
}

const List = (props: Props) => {
  const { isTray } = props
  const {
    hostsData,
    loadHostsData,
    setList,
    applyList,
    setAppliedSelection,
    currentHosts,
    setCurrentHosts,
  } = useHostsData()
  const { configs } = useConfigs()
  const { lang } = useI18n()
  const [selectedIds, setSelectedIds] = useState<string[]>(isTray ? [] : [currentHosts?.id || '0'])
  const [showList, setShowList] = useState<IHostsListObject[]>([])
  const latestHostsData = useRef(hostsData)
  const changeRevision = useRef(0)
  const remoteContentApplyRef = useRef({
    isApplying: false,
    pendingIds: new Set<string>(),
  })

  useEffect(() => {
    latestHostsData.current = hostsData
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
    if (!configs?.write_mode) {
      agent.broadcast(events.show_set_write_mode, { id, on })
      return
    }

    const success = await applyList((list) =>
      setOnStateOfItem(
        list,
        id,
        on,
        configs?.choice_mode ?? 0,
        configs?.multi_chose_folder_switch_all ?? false,
      ),
    )
    if (success) {
      agent.broadcast(events.set_hosts_on_status, id, on)
    } else {
      agent.broadcast(events.set_hosts_on_status, id, !on)
    }
  }

  const applyChangedRemoteHostsToSystem = async (ids: string[]) => {
    if (isTray) return

    const applyState = remoteContentApplyRef.current
    for (const id of ids) {
      if (id) applyState.pendingIds.add(id)
    }
    if (applyState.pendingIds.size === 0 || applyState.isApplying) {
      return
    }

    applyState.isApplying = true
    try {
      while (applyState.pendingIds.size > 0) {
        const changedIds = Array.from(applyState.pendingIds)
        applyState.pendingIds.clear()

        const list: IHostsListObject[] = await actions.getList()
        const hasEnabledChangedHosts = changedIds.some((id) => {
          const hosts = findItemById(list, id)
          return !!hosts?.on
        })
        if (!hasEnabledChangedHosts) continue

        await applyList()
      }
    } catch (e) {
      console.error(e)
    } finally {
      applyState.isApplying = false
    }

    // Race guard: an event arriving after `while` exits but before we
    // clear `isApplying` would have early-returned (saw isApplying=true)
    // and left ids stranded in pendingIds. Re-trigger if so.
    if (applyState.pendingIds.size > 0) {
      applyChangedRemoteHostsToSystem([]).catch((e) => console.error(e))
    }
  }

  useOnBroadcast(
    events.toggle_item,
    (id: string, on: boolean) => {
      if (isTray) return
      return onToggleItem(id, on).catch((error: unknown) => {
        showErrorNotification({ title: lang.fail, message: getErrorMessage(error, lang.fail) })
      })
    },
    [hostsData, configs, isTray],
  )
  useOnBroadcast(
    events.tray_list_updated,
    (selection: Record<string, boolean> | null = null) => {
      if (!isTray) return
      setAppliedSelection(selection)
      loadHostsData()
    },
    [isTray],
  )

  useOnBroadcast(
    events.move_to_trashcan,
    async (ids: string[]) => {
      try {
        await actions.moveManyToTrashcan(ids)
        await loadHostsData()

        if (currentHosts && ids.includes(currentHosts.id)) {
          // 选中删除指定节点后的兄弟节点
          const nextItem = getNextSelectedItem(hostsData.list, (i) => ids.includes(i.id))
          setCurrentHosts(nextItem || null)
          setSelectedIds(nextItem ? [nextItem.id] : [])
        }
      } catch (error) {
        showErrorNotification({ title: lang.fail, message: getErrorMessage(error, lang.fail) })
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

  useOnBroadcast(
    events.hosts_content_changed,
    (hostsId: string) => {
      applyChangedRemoteHostsToSystem([hostsId]).catch((e) => console.error(e))
    },
    [currentHosts, hostsData, isTray, lang],
  )

  useOnBroadcast(
    events.hosts_content_changed_batch,
    (hostsIds: string[]) => {
      applyChangedRemoteHostsToSystem(Array.isArray(hostsIds) ? hostsIds : []).catch((e) =>
        console.error(e),
      )
    },
    [currentHosts, hostsData, isTray, lang],
  )

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
          const revision = ++changeRevision.current
          setShowList(list)
          const restoreView = () => {
            if (revision !== changeRevision.current) return
            const saved = latestHostsData.current.list
            setShowList(
              isTray ? [...saved] : [{ id: '0', title: lang.system_hosts, is_sys: true }, ...saved],
            )
          }
          const newUserList = list.filter((i) => !i.is_sys)

          const enabledIdSeq = (l: IHostsListObject[]) =>
            flatten(l)
              .filter((i) => i.on)
              .map((i) => i.id)
              .join('\n')

          if (enabledIdSeq(hostsData.list) !== enabledIdSeq(newUserList) && configs?.write_mode) {
            applyList(newUserList)
              .then((success) => {
                if (!success) restoreView()
              })
              .catch((error: unknown) => {
                restoreView()
                showErrorNotification({
                  title: lang.fail,
                  message: getErrorMessage(error, lang.fail),
                })
              })
          } else {
            setList(newUserList).catch((error: unknown) => {
              restoreView()
              console.error(error)
            })
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
