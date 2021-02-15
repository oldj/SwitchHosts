import { useModel } from '@@/plugin-model/useModel'
import Button from '@material-ui/core/Button'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogContentText from '@material-ui/core/DialogContentText'
import DialogTitle from '@material-ui/core/DialogTitle'
import { ThemeProvider } from '@material-ui/core/styles'
import EditHostsInfo from '@renderer/components/EditHostsInfo'

import LeftPanel from '@renderer/components/LeftPanel'
import Loading from '@renderer/components/Loading'
import MainPanel from '@renderer/components/MainPanel'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { theme } from '@renderer/libs/theme'
import clsx from 'clsx'
import React, { useEffect, useState } from 'react'
import styles from './index.less'

export default () => {
  const [loading, setLoading] = useState(true)
  const { i18n, setLocale } = useModel('useI18n')
  const { getData } = useModel('useHostsData')
  const [left_width, setLeftWidth] = useState(0)
  const [left_show, setLeftShow] = useState(true)
  const [show_migration, setShowMigration] = useState(false)

  const migrate = async (do_migrate: boolean) => {
    if (do_migrate) {
      await actions.migrateData()
    }
    await getData()
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

    await getData()
    setLoading(false)
  }

  useEffect(() => {
    init().catch(e => console.error(e))
  }, [])

  useOnBroadcast('toggle_left_pannel', () => setLeftShow(!left_show), [left_show])

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <Loading/>
        <Dialog
          open={show_migration}
          // onClose={handleClose}
          maxWidth="xs"
        >
          <DialogTitle id="alert-dialog-title">{i18n.lang.migrate_data}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {i18n.lang.migrate_confirm}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => migrate(false)} color="primary">
              {i18n.lang.btn_cancel}
            </Button>
            <Button onClick={() => migrate(true)} color="primary" autoFocus>
              {i18n.lang.btn_ok}
            </Button>
          </DialogActions>
        </Dialog>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={theme}>
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
      </div>
    </ThemeProvider>
  )
}
