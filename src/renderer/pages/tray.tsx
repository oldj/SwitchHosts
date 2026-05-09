import logo from '@/assets/logo@4x.png'
import events from '@common/events'
import { ScrollArea } from '@mantine/core'
import List from '@renderer/components/List'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import useResolvedTheme from '@renderer/models/useResolvedTheme'
import { applyThemeToBody } from '@renderer/utils/theme'
import { useEffect } from 'react'
import { BiArea } from 'react-icons/bi'
import styles from './tray.module.scss'

const TrayPage = () => {
  const { loadHostsData } = useHostsData()
  const { setLocale } = useI18n()
  const { configs, loadConfigs } = useConfigs()
  const resolvedTheme = useResolvedTheme(configs?.theme)

  const update = () => {
    if (!configs) return

    setLocale(configs.locale)
    loadHostsData().catch((e) => console.error(e))
  }

  useEffect(() => {
    document.documentElement.classList.add('tray-page')
    document.body.classList.add('tray-page')
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(update, [configs])

  useEffect(() => {
    if (!configs) return

    applyThemeToBody(resolvedTheme, [`platform-${agent.platform}`, 'tray-page'])
  }, [configs, resolvedTheme])

  useOnBroadcast(events.config_updated, loadConfigs, [configs])

  const showMain = () => {
    agent.broadcast(events.active_main_window)
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.header}>
        <img className={styles.logo} src={logo} alt="" />
        <span>SwitchHosts</span>
      </h1>
      <ScrollArea className={styles.body} scrollbars="y" type="hover">
        <List isTray={true} />
      </ScrollArea>
      <div className={styles.footer}>
        <span onClick={showMain}>
          <BiArea />
        </span>
      </div>
    </div>
  )
}

export default TrayPage
