import { useModel } from '@@/plugin-model/useModel'
import List from '@renderer/components/List'
import { agent } from '@renderer/core/agent'
import React, { useEffect } from 'react'
import { BiArea } from 'react-icons/bi'
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

    document.body.classList.add(`platform-${agent.platform}`, `theme-${configs.theme}`)
  }, [ configs ])

  const showMain = () => {
    agent.broadcast('active_main_window')
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span/>
        <span>SwitchHosts!</span>
        <span onClick={showMain}><BiArea/></span>
      </div>
      <div className={styles.body}>
        <List is_tray={true}/>
      </div>
    </div>
  )
}
