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
import DialogTitle from '@material-ui/core/DialogTitle'
import FormControl from '@material-ui/core/FormControl'
import FormLabel from '@material-ui/core/FormLabel'
import { ThemeProvider } from '@material-ui/core/styles'
import TextField from '@material-ui/core/TextField'
import FormatAlignCenterIcon from '@material-ui/icons/FormatAlignCenter'
import FormatAlignJustifyIcon from '@material-ui/icons/FormatAlignJustify'
import FormatAlignLeftIcon from '@material-ui/icons/FormatAlignLeft'
import FormatAlignRightIcon from '@material-ui/icons/FormatAlignRight'
import ToggleButton from '@material-ui/lab/ToggleButton'
import ToggleButtonGroup from '@material-ui/lab/ToggleButtonGroup'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { theme } from '@renderer/libs/theme'
import ItemIcon from '@renderer/components/ItemIcon'
import { HostsListObjectType } from '@root/common/data'
import React, { useState } from 'react'
import styles from './EditHostsInfo.less'

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
        maxWidth="lg"
      >
        <DialogTitle id="alert-dialog-title">{hosts ? i18n.lang.hosts_edit : i18n.lang.hosts_add}</DialogTitle>
        <DialogContent style={{ width: 400 }}>
          <div className={styles.ln}>
            <FormControl component="fieldset" fullWidth={true}>
              <FormLabel component="legend">{i18n.lang.hosts_title}</FormLabel>
              <TextField
                id="hosts_title"
                // label={i18n.lang.hosts_title}
                variant="outlined"
                required
                size="small"
                fullWidth={true}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </FormControl>
          </div>

          <div className={styles.ln}>
            <ToggleButtonGroup
              exclusive
              size="small"
            >
              <ToggleButton value="local">
                <ItemIcon where="local"/> {i18n.lang.local}
              </ToggleButton>
              <ToggleButton value="center" aria-label="centered">
                <FormatAlignCenterIcon/> {i18n.lang.remote}
              </ToggleButton>
              <ToggleButton value="right" aria-label="right aligned">
                <FormatAlignRightIcon/> {i18n.lang.group}
              </ToggleButton>
              <ToggleButton value="justify" aria-label="justified" disabled>
                <FormatAlignJustifyIcon/> {i18n.lang.folder}
              </ToggleButton>
            </ToggleButtonGroup>
          </div>
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
