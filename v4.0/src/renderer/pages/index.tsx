import { useModel } from '@@/plugin-model/useModel'
import { actions, agent } from '@renderer/core/agent'
import LeftPanel from '@renderer/components/LeftPanel'
import Loading from '@renderer/components/Loading'
import MainPanel from '@renderer/components/MainPanel'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import styles from './index.less'

export default () => {
  const [loading, setLoading] = useState(true)
  const { setLocale } = useModel('useI18n')
  const { getData } = useModel('useHostsData')
  const [left_width, setLeftWidth] = useState(0)
  const [left_show, setLeftShow] = useState(true)

  const init = async () => {
    setLocale(await actions.configGet('locale'))
    setLeftWidth(await actions.configGet('left_panel_width'))
    setLeftShow(await actions.configGet('left_panel_show'))

    let theme = await actions.configGet('theme')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)

    await getData()
  }

  useEffect(() => {
    init().then(() => setLoading(false))
  }, [])

  useOnBroadcast('toggle_left_pannel', () => setLeftShow(!left_show), [left_show])

  if (loading) {
    return <Loading/>
  }

  return (
    <div className={styles.root}>
      <div className={styles.left} style={{
        width: left_width,
        left: left_show ? 0 : -left_width,
      }}>
        <LeftPanel width={left_width}/>
      </div>
      <div
        className={clsx(styles.main)}
        style={{ width: `calc(100% - ${left_show ? left_width : 0}px)` }}
      >
        <MainPanel has_left_panel={left_show}/>
      </div>
    </div>
  )
}
