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

interface Props {

}

const Trashcan = (props: Props) => {
  const { lang } = useModel('useI18n')
  const { hosts_data, loadHostsData, setList } = useModel('useHostsData')
  const [trash_list, setTrashList] = useState<ITrashcanListObject[]>([])

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
      is_root: true,
    }

    let list: ITrashcanListObject[] = [root]

    console.log(hosts_data.trashcan)
    hosts_data.trashcan.map(i => {
      root.children && root.children.push({
        ...i,
        id: i.data.id,
        can_drag: false,
      })
    })

    setTrashList(list)
  }, [hosts_data.trashcan])

  return (
    <div className={styles.root}>
      <Tree
        data={trash_list}
        nodeRender={(item) => <TrashcanItem data={item as ITrashcanListObject}/>}
        collapseArrow={<RightOutlined/>}
      />
    </div>
  )
}

export default Trashcan
