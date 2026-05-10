import events from '@common/events'
import About from '@renderer/components/About'
import EditHostsInfo from '@renderer/components/EditHostsInfo'
import History from '@renderer/components/History'
import LeftPanel from '@renderer/components/LeftPanel'
import LeftSidebar from '@renderer/components/LeftSidebar'
import Loading from '@renderer/components/Loading'
import MainPanel from '@renderer/components/MainPanel'
import PreferencePanel from '@renderer/components/Pref'
import ResizeHandle from '@renderer/components/ResizeHandle'
import RightPanel from '@renderer/components/RightPanel'
import SetWriteMode from '@renderer/components/SetWriteMode'
import UpdateDialog from '@renderer/components/UpdateDialog'
import { agent } from '@renderer/core/agent'
import { showErrorNotification } from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useResolvedTheme from '@renderer/models/useResolvedTheme'
import { applyThemeToBody, normalizeTheme } from '@renderer/utils/theme'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import TopBar from '../components/TopBar'
import useHostsData from '../models/useHostsData'
import useI18n from '../models/useI18n'
import styles from './index.module.scss'

const LEFT_SIDEBAR_WIDTH = 40
const BODY_PADDING_RIGHT = 8
const PANEL_MIN_WIDTH = 100

const clampPanel = (value: number) =>
  Math.round(Math.min(Math.max(value, PANEL_MIN_WIDTH), window.innerWidth * 0.5))

const MainPage = () => {
  const [loading, setLoading] = useState(true)
  const mainWindowReadySentRef = useRef(false)
  const { setLocale, i18n, lang } = useI18n()
  const { loadHostsData } = useHostsData()
  const { configs, loadConfigs, updateConfigs } = useConfigs()
  const [leftWidth, setLeftWidth] = useState(0)
  const [rightWidth, setRightWidth] = useState(240)
  const [leftShow, setLeftShow] = useState(true)
  const [rightShow, setRightShow] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [useSystemWindowFrame, setSystemFrame] = useState(false)
  const resolvedTheme = useResolvedTheme(configs?.theme)
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
    setRightWidth(configs.right_panel_width)
    setLeftShow(configs.left_panel_show)
    setRightShow(configs.right_panel_show)
    setSystemFrame(configs.use_system_window_frame)

    await agent.darkModeToggle(normalizeTheme(configs.theme))
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

  useEffect(() => {
    if (!configs) return

    applyThemeToBody(resolvedTheme, [`platform-${agent.platform}`])
  }, [configs, resolvedTheme])

  useEffect(() => {
    if (loading || !configs || mainWindowReadySentRef.current) return

    mainWindowReadySentRef.current = true
    window.setTimeout(() => {
      Promise.resolve(agent.broadcast(events.main_window_ready)).catch((e) => console.error(e))
    }, 0)
  }, [configs, loading])

  useOnBroadcast(events.toggle_left_panel, (show: boolean) => {
    setLeftShow(show)
    updateConfigs({ left_panel_show: show }).catch((e) => console.error(e))
  })
  useOnBroadcast(events.toggle_right_panel, (show: boolean) => {
    setRightShow(show)
    updateConfigs({ right_panel_show: show }).catch((e) => console.error(e))
  })

  // Backend rolls back http_api_on when bind() fails (e.g. port is in
  // use). Surface a toast and reload configs so the preferences pane's
  // toggle snaps back from "on" to "off" instead of lying about state.
  useOnBroadcast(
    events.http_api_start_failed,
    (errorMsg: string) => {
      showErrorNotification({
        title: lang.fail,
        message: i18n.trans('http_api_start_failed', [errorMsg ?? '']),
      })
      loadConfigs().catch((e) => console.error(e))
    },
    [lang, i18n],
  )

  const widthsRef = useRef({ left: leftWidth, right: rightWidth })
  const updateConfigsRef = useRef(updateConfigs)
  useEffect(() => {
    widthsRef.current.left = leftWidth
    widthsRef.current.right = rightWidth
    updateConfigsRef.current = updateConfigs
  })

  useEffect(() => {
    const onResize = () => {
      const max = window.innerWidth * 0.5
      const patch: { left_panel_width?: number; right_panel_width?: number } = {}
      if (widthsRef.current.left > max) {
        const lw = clampPanel(widthsRef.current.left)
        patch.left_panel_width = lw
        setLeftWidth(lw)
      }
      if (widthsRef.current.right > max) {
        const rw = clampPanel(widthsRef.current.right)
        patch.right_panel_width = rw
        setRightWidth(rw)
      }
      if (Object.keys(patch).length > 0) {
        updateConfigsRef.current(patch).catch((e) => console.error(e))
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (loading) {
    return <Loading />
  }

  return (
    <div
      className={styles.root}
      style={{ '--swh-left-sidebar-width': `${LEFT_SIDEBAR_WIDTH}px` } as React.CSSProperties}
    >
      <TopBar
        showLeftPanel={leftShow}
        showRightPanel={rightShow}
        useSystemWindowFrame={useSystemWindowFrame}
      />

      <div className={clsx(styles.body, { [styles.dragging]: dragging })}>
        <div className={styles.left_sidebar} style={{ width: LEFT_SIDEBAR_WIDTH }}>
          <LeftSidebar showLeftPanel={leftShow} />
        </div>
        <div
          className={styles.left}
          style={{
            width: leftWidth,
            left: leftShow ? LEFT_SIDEBAR_WIDTH : -leftWidth,
          }}
        >
          <LeftPanel width={leftWidth} />
          {leftShow && (
            <ResizeHandle
              side="left"
              current={leftWidth}
              min={PANEL_MIN_WIDTH}
              onResize={setLeftWidth}
              onResizeEnd={(w) => {
                updateConfigs({ left_panel_width: w }).catch((e) => console.error(e))
              }}
              onDragStart={() => setDragging(true)}
              onDragEnd={() => setDragging(false)}
            />
          )}
        </div>
        <div
          className={clsx(styles.main)}
          style={
            {
              left: LEFT_SIDEBAR_WIDTH + (leftShow ? leftWidth : 0),
              right: BODY_PADDING_RIGHT + (rightShow ? rightWidth : 0),
              '--editor-radius-left': leftShow ? '0' : 'var(--swh-border-radius)',
              '--editor-radius-right': rightShow ? '0' : 'var(--swh-border-radius)',
            } as React.CSSProperties
          }
        >
          <MainPanel />
        </div>
        <div
          className={styles.right_panel}
          data-testid="right-panel"
          data-open={rightShow}
          style={{
            width: rightWidth,
            right: rightShow ? BODY_PADDING_RIGHT : -rightWidth,
          }}
        >
          {rightShow && (
            <ResizeHandle
              side="right"
              current={rightWidth}
              min={PANEL_MIN_WIDTH}
              onResize={setRightWidth}
              onResizeEnd={(w) => {
                updateConfigs({ right_panel_width: w }).catch((e) => console.error(e))
              }}
              onDragStart={() => setDragging(true)}
              onDragEnd={() => setDragging(false)}
            />
          )}
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
