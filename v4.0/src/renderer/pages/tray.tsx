import { useModel } from '@@/plugin-model/useModel'
import { useColorMode } from '@chakra-ui/react'
import List from '@renderer/components/List'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import React, { useEffect } from 'react'
import { BiArea } from 'react-icons/bi'
import styles from './tray.less'

export default () => {
  const { loadHostsData } = useModel('useHostsData')
  const { setLocale } = useModel('useI18n')
  const { configs, loadConfigs } = useModel('useConfigs')
  const { colorMode, setColorMode } = useColorMode()

  const update = () => {
    if (!configs) return

    setLocale(configs.locale)
    loadHostsData()
      .catch(e => console.error(e))

    if (colorMode !== configs.theme) {
      setColorMode(configs.theme)
    }

    let cls = document.body.className
    document.body.className = cls.replace(/\btheme-\w+/ig, '')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${configs.theme}`)
  }

  useEffect(update, [configs])
  useOnBroadcast('config_updated', loadConfigs, [configs])

  const showMain = () => {
    agent.broadcast('active_main_window')
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.header}>
        SwitchHosts
      </h1>
      <div className={styles.body}>
        <List is_tray={true}/>
      </div>
      <div className={styles.footer}>
        <span onClick={showMain}><BiArea/></span>
      </div>
    </div>
  )
}
