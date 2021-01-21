import { useModel } from '@@/plugin-model/useModel'
import { actions, agent } from '@renderer/agent'
import LeftPanel from '@renderer/components/LeftPanel'
import Loading from '@renderer/components/Loading'
import MainPanel from '@renderer/components/MainPanel'
// import Lang from '@renderer/components/Lang'
// import version from '@root/version.json'
import React, { useEffect, useState } from 'react'
import styles from './index.less'

export default () => {
  const [loading, setLoading] = useState(true)
  const { i18n, setLocale } = useModel('useI18n')
  const [left_width, setLeftWidth] = useState(200)

  const init = async () => {
    setLocale(await actions.configGet('locale'))
    setLeftWidth(await actions.configGet('left_panel_width'))

    let theme = await actions.configGet('theme')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)
  }

  useEffect(() => {
    init().then(() => setLoading(false))
  }, [])

  if (loading) {
    return <Loading/>
  }

  return (
    <div className={styles.root}>
      {/*<div>{i18n.lang.test}</div>*/}
      {/*<Lang locale='zh'>汉字</Lang>*/}
      {/*<Lang locale='en'>English</Lang>*/}
      {/*<div>Version: {version.join('.')}</div>*/}
      <div className={styles.left} style={{ width: left_width }}>
        <LeftPanel width={left_width}/>
      </div>
      <div className={styles.main} style={{ width: `calc(100% - ${left_width}px)` }}>
        <MainPanel/>
      </div>
    </div>
  )
}
