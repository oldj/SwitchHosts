/**
 * TrashcanItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import ItemIcon from '@renderer/components/ItemIcon'
import { ITrashcanListObject } from '@root/common/data'
import clsx from 'clsx'
import React from 'react'
import list_item_styles from './ListItem.less'
import styles from './TrashcanItem.less'

interface Props {
  data: ITrashcanListObject;
}

const TrashcanItem = (props: Props) => {
  const { data } = props
  const { lang } = useModel('useI18n')

  const onSelect = (i: any) => {
    console.log(i)
  }

  return (
    <div className={clsx(styles.root, data.where === 'trashcan' && styles.trashcan_title)}>
      <div className={styles.title} onClick={onSelect}>
        <span className={list_item_styles.icon}>
          <ItemIcon where={data.where} is_collapsed={data.is_collapsed}/>
        </span>
        {data.data.title || lang.untitled}

        {data.is_root ? (
          <span className={styles.count}>{data.children?.length || 0}</span>
        ) : null}
      </div>
    </div>
  )
}

export default TrashcanItem
