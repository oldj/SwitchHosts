/**
 * TrashcanItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { ITrashcanListObject } from '@root/common/data'
import React from 'react'
import styles from './TrashcanItem.less'

interface Props {
  data: ITrashcanListObject;
}

const TrashcanItem = (props: Props) => {
  const { data } = props
  const { lang } = useModel('useI18n')

  return (
    <div className={styles.root}>
      <span>{data.data.title || lang.untitled}</span>
      {data.is_root ? (
        <span className={styles.count}>{data.children?.length || 0}</span>
      ) : null}
    </div>
  )
}

export default TrashcanItem
