import events from '@common/events'
import List from '@renderer/components/List'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import { useEffect } from 'react'
import { BiArea } from 'react-icons/bi'
import styles from './tray.module.scss'

const TrayPage = () => {
  const { loadHostsData } = useHostsData()
  const { setLocale } = useI18n()
  const { configs, loadConfigs } = useConfigs()

  const update = () => {
    if (!configs) return

    setLocale(configs.locale)
    loadHostsData().catch((e) => console.error(e))

    const cls = document.body.className
    document.body.className = cls.replace(/\btheme-\w+/gi, '')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${configs.theme}`, 'tray-page')
  }

  useEffect(() => {
    document.documentElement.classList.add('tray-page')
    document.body.classList.add('tray-page')
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(update, [configs])
  useOnBroadcast(events.config_updated, loadConfigs, [configs])

  const showMain = () => {
    agent.broadcast(events.active_main_window)
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.header}>SwitchHosts</h1>
      <div className={styles.body}>
        <List isTray={true} />
      </div>
      <div className={styles.footer}>
        <span onClick={showMain}>
          <BiArea />
        </span>
      </div>
    </div>
  )
}

export default TrayPage
