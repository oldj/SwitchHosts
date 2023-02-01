/**
 * Trashcan
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Center } from '@chakra-ui/react'
import TrashcanItem from '@renderer/components/LeftPanel/TrashcanItem'
import list_styles from '@renderer/components/List/index.module.scss'
import { Tree } from '@renderer/components/Tree'
import { ITrashcanListObject } from '@common/data'
import React, { useEffect, useState } from 'react'
import { BiChevronRight } from 'react-icons/bi'
import styles from './Trashcan.module.scss'
import useI18n from '@renderer/models/useI18n'
import useHostsData from '@renderer/models/useHostsData'

const Trashcan = () => {
  const { lang } = useI18n()
  const { hosts_data, current_hosts, setCurrentHosts } = useHostsData()
  const [trash_list, setTrashList] = useState<ITrashcanListObject[]>([])
  const [is_collapsed, setIsCollapsed] = useState(true)

  useEffect(() => {
    let root: ITrashcanListObject = {
      id: '0',
      data: {
        id: '0',
        title: lang.trashcan,
      },
      add_time_ms: 0,
      children: [],
      can_drag: false,
      can_select: false,
      is_collapsed,
      is_root: true,
      type: 'trashcan',
      parent_id: null,
    }

    let list: ITrashcanListObject[] = [root]

    hosts_data.trashcan.map((i) => {
      root.children &&
        root.children.push({
          ...i,
          id: i.data.id,
          can_drag: false,
          type: i.data.type,
        })
    })

    setTrashList(list)
  }, [hosts_data.trashcan, is_collapsed])

  const onSelect = (ids: string[]) => {
    let id = ids[0]
    let item = hosts_data.trashcan.find((i) => i.data.id === id)
    if (!item) return
    setCurrentHosts(item.data)
  }

  return (
    <div className={styles.root}>
      <Tree
        data={trash_list}
        nodeRender={(item) => <TrashcanItem data={item as ITrashcanListObject} />}
        collapseArrow={
          <Center w="20px" h="20px">
            <BiChevronRight />
          </Center>
        }
        nodeClassName={list_styles.node}
        nodeSelectedClassName={list_styles.node_selected}
        nodeCollapseArrowClassName={list_styles.arrow}
        onSelect={onSelect}
        selected_ids={current_hosts ? [current_hosts.id] : []}
        onChange={(list) => setIsCollapsed(!!list[0]?.is_collapsed)}
      />
    </div>
  )
}

export default Trashcan
