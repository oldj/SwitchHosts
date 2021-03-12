/**
 * StatusBar
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import React from 'react'
import styles from './StatusBar.less'

interface Props {
  line_count: number;
  read_only?: boolean;
}

const StatusBar = (props: Props) => {
  const { i18n } = useModel('useI18n')

  return (
    <div className={styles.root}>
      <div className={styles.left}>
        <span
          className={styles.item}>{props.line_count} {props.line_count > 1 ? i18n.lang.lines : i18n.lang.line}</span>
        <span className={styles.item}>{props.read_only ? i18n.lang.read_only : ''}</span>
      </div>
      <div className={styles.right}>right</div>
    </div>
  )
}

export default StatusBar
