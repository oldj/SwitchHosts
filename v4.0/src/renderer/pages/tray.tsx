import { useModel } from '@@/plugin-model/useModel'
import React from 'react'
import styles from './tray.less'

export default () => {
  const { lang, setLocale } = useModel('useI18n')
  const { loadHostsData } = useModel('useHostsData')
  const { configs } = useModel('useConfigs')

  return (
    <div className={styles.root}>
      tray
    </div>
  )
}
