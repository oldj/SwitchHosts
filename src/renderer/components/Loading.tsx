/**
 * Loading
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import React from 'react'
import styles from './Loading.less'

interface Props {}

const Loading = (props: Props) => {
  const { i18n } = useModel('useI18n')

  return <div className={styles.root}>{i18n.lang.loading}</div>
}

export default Loading
