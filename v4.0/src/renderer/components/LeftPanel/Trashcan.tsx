/**
 * Trashcan
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { RightOutlined } from '@ant-design/icons'
import TrashcanItem from '@renderer/components/LeftPanel/TrashcanItem'
import { Tree } from '@renderer/components/Tree'
import { ITrashcanListObject } from '@root/common/data'
import React, { useEffect, useState } from 'react'
import styles from './Trashcan.less'
import list_styles from './List.less'

interface Props {

}

const Trashcan = (props: Props) => {
  const { lang } = useModel('useI18n')
  const { hosts_data } = useModel('useHostsData')
  const { current_hosts, setCurrentHosts } = useModel('useCurrentHosts')
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
      where: 'trashcan',
    }

    let list: ITrashcanListObject[] = [root]

    hosts_data.trashcan.map(i => {
      root.children && root.children.push({
        ...i,
        id: i.data.id,
        can_drag: false,
        where: i.data.where,
      })
    })

    setTrashList(list)
  }, [hosts_data.trashcan, is_collapsed])

  const onSelect = (id: string) => {
    let item = hosts_data.trashcan.find(i => i.data.id === id)
    if (!item) return
    setCurrentHosts(item.data)
  }

  return (
    <div className={styles.root}>
      <Tree
        data={trash_list}
        nodeRender={(item) => <TrashcanItem data={item as ITrashcanListObject}/>}
        collapseArrow={<RightOutlined/>}
        nodeClassName={list_styles.node}
        nodeSelectedClassName={list_styles.node_selected}
        nodeCollapseArrowClassName={list_styles.arrow}
        onSelect={onSelect}
        selected_id={current_hosts?.id}
        onChange={list => setIsCollapsed(!!list[0]?.is_collapsed)}
      />
    </div>
  )
}

export default Trashcan
