/**
 * EditHosts
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import Button from '@material-ui/core/Button'
import Dialog from '@material-ui/core/Dialog'
import DialogActions from '@material-ui/core/DialogActions'
import DialogContent from '@material-ui/core/DialogContent'
import DialogContentText from '@material-ui/core/DialogContentText'
import DialogTitle from '@material-ui/core/DialogTitle'
import { ThemeProvider } from '@material-ui/core/styles'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { theme } from '@renderer/libs/theme'
import { HostsListObjectType } from '@root/common/data'
import React, { useState } from 'react'

interface Props {
}

const EditHostsInfo = (props: Props) => {
  const { i18n } = useModel('useI18n')
  const [hosts, setHosts] = useState<HostsListObjectType | null>(null)
  const [is_show, setIsShow] = useState(false)

  const onCancel = async () => {
    setHosts(null)
    setIsShow(false)
  }

  const onSave = async () => {

  }

  useOnBroadcast('edit_hosts_info', (hosts?: HostsListObjectType) => {
    setHosts(hosts || null)
    setIsShow(true)
  })

  useOnBroadcast('add_new', () => {
    setHosts(null)
    setIsShow(true)
  })

  return (
    <ThemeProvider theme={theme}>
      <Dialog
        open={is_show}
        onClose={onCancel}
        maxWidth="sm"
      >
        <DialogTitle id="alert-dialog-title">{hosts ? i18n.lang.hosts_edit : i18n.lang.hosts_add}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            content
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} color="primary">
            {i18n.lang.btn_cancel}
          </Button>
          <Button onClick={onSave} color="primary" autoFocus>
            {i18n.lang.btn_ok}
          </Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  )
}

export default EditHostsInfo
