import { useModel } from '@@/plugin-model/useModel'
import List from '@renderer/components/List'
import React, { useEffect } from 'react'
import styles from './tray.less'

export default () => {
  const { loadHostsData } = useModel('useHostsData')
  const { setLocale } = useModel('useI18n')
  const { configs } = useModel('useConfigs')

  useEffect(() => {
    if (!configs) return

    setLocale(configs.locale)
    loadHostsData()
      .catch(e => console.error(e))
  }, [ configs ])

  return (
    <div className={styles.root}>
      <div className={styles.header}>SwitchHosts!</div>
      <div className={styles.body}>
        <List is_tray={true}/>
      </div>
    </div>
  )
}
