import { Button, useToast } from '@chakra-ui/react'
import About from '@renderer/components/About'
import EditHostsInfo from '@renderer/components/EditHostsInfo'
import History from '@renderer/components/History'
import LeftPanel from '@renderer/components/LeftPanel'
import Loading from '@renderer/components/Loading'
import MainPanel from '@renderer/components/MainPanel'
import PreferencePanel from '@renderer/components/Pref'
import SudoPasswordInput from '@renderer/components/SudoPasswordInput'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { download_url } from '@common/constants'
import events from '@common/events'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import TopBar from '../components/TopBar'
import styles from './index.module.scss'
import SetWriteMode from '@renderer/components/SetWriteMode'
import useI18n from '../models/useI18n'
import useConfigs from '@renderer/models/useConfigs'
import useHostsData from '../models/useHostsData'

export default () => {
  const [loading, setLoading] = useState(true)
  const { i18n, lang, setLocale } = useI18n()
  const { loadHostsData } = useHostsData()
  const { configs } = useConfigs()
  const [left_width, setLeftWidth] = useState(0)
  const [left_show, setLeftShow] = useState(true)
  const [use_system_window_frame, setSystemFrame] = useState(false)
  const [show_migration, setShowMigration] = useState(false)
  const toast = useToast()

  const migrate = async (do_migrate: boolean) => {
    if (do_migrate) {
      await actions.migrateData()
    } else {
      setShowMigration(false)
    }
    await loadHostsData()
    setLoading(false)
  }

  const init = async () => {
    let if_migrate = await actions.migrateCheck()
    if (if_migrate) {
      setShowMigration(true)
      return
    }

    await loadHostsData()
    setLoading(false)
  }

  const onConfigsUpdate = async () => {
    if (!configs) return

    setLocale(configs.locale)
    setLeftWidth(configs.left_panel_width)
    setLeftShow(configs.left_panel_show)
    setSystemFrame(configs.use_system_window_frame)

    let theme = configs.theme
    let cls = document.body.className
    document.body.className = cls.replace(/\btheme-\w+/gi, '')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)
    await agent.darkModeToggle(theme)
  }

  useEffect(() => {
    init().catch((e) => console.error(e))
  }, [])

  useEffect(() => {
    onConfigsUpdate().catch((e) => console.error(e))
  }, [configs])

  useOnBroadcast(events.toggle_left_panel, (show: boolean) => setLeftShow(show))

  useOnBroadcast(
    events.new_version,
    (new_version: string) => {
      toast({
        title: lang.new_version_found,
        description: (
          <div className={styles.new_version}>
            <span>{i18n.trans('latest_version_desc', [new_version])}</span>
            <Button
              ml="10px"
              variant="link"
              onClick={() => {
                actions.openUrl(download_url)
              }}
            >
              {lang.download}
            </Button>
          </div>
        ),
        status: 'info',
        duration: 10000,
        isClosable: true,
      })
    },
    [lang, i18n],
  )

  if (loading) {
    if (show_migration) {
      setTimeout(() => {
        migrate(confirm(lang.migrate_confirm)).catch((e) => alert(e.message))
      }, 200)
    }

    return <Loading />
  }

  return (
    <div className={styles.root}>
      <TopBar show_left_panel={left_show} use_system_window_frame={use_system_window_frame} />

      <div>
        <div
          className={styles.left}
          style={{
            width: left_width,
            left: left_show ? 0 : -left_width,
          }}
        >
          <LeftPanel width={left_width} />
        </div>
        <div
          className={clsx(styles.main)}
          style={{ width: `calc(100% - ${left_show ? left_width : 0}px)` }}
        >
          <MainPanel />
        </div>
      </div>

      <EditHostsInfo />
      <SudoPasswordInput />
      <SetWriteMode />
      <PreferencePanel />
      <History />
      <About />
    </div>
  )
}
