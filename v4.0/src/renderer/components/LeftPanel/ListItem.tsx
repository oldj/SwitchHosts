/**
 * ListItem
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import SwitchButton from '@renderer/components/LeftPanel/SwitchButton'
import { HostsObjectType } from '@root/common/data'
import React from 'react'
import styles from './ListItem.less'

interface Props {
  data: HostsObjectType;
  level?: number;
}

const ListItem = (props: Props) => {
  const { i18n } = useModel('useI18n')
  const { data } = props
  let level = props.level || 0

  if (!data) return null

  return (
    <div className={styles.root}>
      <div className={styles.item} style={{ paddingLeft: `${level}em` }}>
        <div className={styles.title}>{data.title || i18n.lang.untitled}</div>
        <div className={styles.status}>
          <SwitchButton on={data.on}/>
        </div>
      </div>
      <div className={styles.children}>
        {(data.children || []).map(item => (
          <ListItem data={item} key={item.id} level={level + 1}/>
        ))}
      </div>
    </div>
  )
}

export default ListItem
