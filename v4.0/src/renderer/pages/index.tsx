import { useModel } from '@@/plugin-model/useModel'
import EditHostsInfo from '@renderer/components/EditHostsInfo'
import LeftPanel from '@renderer/components/LeftPanel'
import Loading from '@renderer/components/Loading'
import MainPanel from '@renderer/components/MainPanel'
import SudoPasswordInput from '@renderer/components/SudoPasswordInput'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { Modal } from 'antd'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import styles from './index.less'

export default () => {
  const [ loading, setLoading ] = useState(true)
  const { i18n, setLocale } = useModel('useI18n')
  const { lang } = i18n
  const { loadHostsData } = useModel('useHostsData')
  const [ left_width, setLeftWidth ] = useState(0)
  const [ left_show, setLeftShow ] = useState(true)
  const [ show_migration, setShowMigration ] = useState(false)

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
    setLocale(await actions.configGet('locale'))
    setLeftWidth(await actions.configGet('left_panel_width'))
    setLeftShow(await actions.configGet('left_panel_show'))

    let theme = await actions.configGet('theme')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)

    let if_migrate = await actions.migrateCheck()
    if (if_migrate) {
      setShowMigration(true)
      return
    }

    await loadHostsData()
    setLoading(false)
  }

  useEffect(() => {
    init().catch(e => console.error(e))
  }, [])

  useOnBroadcast('toggle_left_pannel', () => setLeftShow(!left_show), [ left_show ])

  if (loading) {
    if (show_migration) {
      Modal.confirm({
        title: lang.migrate_data,
        content: lang.migrate_confirm,
        onOk: () => {
          return migrate(true)
        },
        onCancel: () => {
          return migrate(false)
        },
        okText: lang.btn_ok,
        cancelText: lang.btn_cancel,
      })
    }

    return (
      <Loading/>
    )
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
      <EditHostsInfo/>
      <SudoPasswordInput/>
    </div>
  )
}
