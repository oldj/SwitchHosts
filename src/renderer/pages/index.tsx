import events from '@common/events'
import About from '@renderer/components/About'
import EditHostsInfo from '@renderer/components/EditHostsInfo'
import History from '@renderer/components/History'
import LeftPanel from '@renderer/components/LeftPanel'
import LeftSidebar from '@renderer/components/LeftSidebar'
import Loading from '@renderer/components/Loading'
import MainPanel from '@renderer/components/MainPanel'
import PreferencePanel from '@renderer/components/Pref'
import RightPanel from '@renderer/components/RightPanel'
import SetWriteMode from '@renderer/components/SetWriteMode'
import UpdateDialog from '@renderer/components/UpdateDialog'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import TopBar from '../components/TopBar'
import useHostsData from '../models/useHostsData'
import useI18n from '../models/useI18n'
import styles from './index.module.scss'

const LEFT_SIDEBAR_WIDTH = 40
const RIGHT_PANEL_WIDTH = 240
const BODY_PADDING_RIGHT = 8

const MainPage = () => {
  const [loading, setLoading] = useState(true)
  const { setLocale } = useI18n()
  const { loadHostsData } = useHostsData()
  const { configs } = useConfigs()
  const [leftWidth, setLeftWidth] = useState(0)
  const [leftShow, setLeftShow] = useState(true)
  const [rightShow, setRightShow] = useState(true)
  const [useSystemWindowFrame, setSystemFrame] = useState(false)
  const init = async () => {
    // v5: migration is handled automatically by the Rust backend on startup.
    // The renderer only needs to load data.
    try {
      await loadHostsData()
    } finally {
      setLoading(false)
    }
  }

  const onConfigsUpdate = async () => {
    if (!configs) return

    setLocale(configs.locale)
    setLeftWidth(configs.left_panel_width)
    setLeftShow(configs.left_panel_show)
    setRightShow(configs.right_panel_show)
    setSystemFrame(configs.use_system_window_frame)

    const theme = configs.theme
    const cls = document.body.className
    document.body.className = cls.replace(/\btheme-\w+/gi, '')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)
    await agent.darkModeToggle(theme)
  }

  useEffect(() => {
    init().catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- apply config side effects (locale, layout, theme) to local state and DOM
    onConfigsUpdate().catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs])

  useOnBroadcast(events.toggle_left_panel, (show: boolean) => setLeftShow(show))
  useOnBroadcast(events.toggle_right_panel, (show: boolean) => setRightShow(show))

  if (loading) {
    return <Loading />
  }

  return (
    <div className={styles.root}>
      <TopBar
        showLeftPanel={leftShow}
        showRightPanel={rightShow}
        useSystemWindowFrame={useSystemWindowFrame}
      />

      <div className={styles.body}>
        <div className={styles.left_sidebar} style={{ width: LEFT_SIDEBAR_WIDTH }}>
          <LeftSidebar />
        </div>
        <div
          className={styles.left}
          style={{
            width: leftWidth,
            left: leftShow ? LEFT_SIDEBAR_WIDTH : -leftWidth,
          }}
        >
          <LeftPanel width={leftWidth} />
        </div>
        <div
          className={clsx(styles.main)}
          style={
            {
              left: LEFT_SIDEBAR_WIDTH + (leftShow ? leftWidth : 0),
              right: BODY_PADDING_RIGHT + (rightShow ? RIGHT_PANEL_WIDTH : 0),
              '--editor-radius-left': leftShow ? '0' : 'var(--swh-border-radius)',
              '--editor-radius-right': rightShow ? '0' : 'var(--swh-border-radius)',
            } as React.CSSProperties
          }
        >
          <MainPanel />
        </div>
        <div
          className={styles.right_panel}
          style={{
            width: RIGHT_PANEL_WIDTH,
            right: rightShow ? BODY_PADDING_RIGHT : -RIGHT_PANEL_WIDTH,
          }}
        >
          <RightPanel />
        </div>
        <div className={styles.body_frame} />
      </div>

      <EditHostsInfo />
      <SetWriteMode />
      <PreferencePanel />
      <History />
      <UpdateDialog />
      <About />
    </div>
  )
}

export default MainPage
