/**
 * Loading
 * @author: oldj
 * @homepage: https://oldj.net
 */

import React from 'react'
import styles from './Loading.module.scss'
import useI18n from '@renderer/models/useI18n'

const Loading = () => {
  const { i18n } = useI18n()

  return <div className={styles.root}>{i18n.lang.loading}</div>
}

export default Loading
