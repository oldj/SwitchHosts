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
import FormHelperText from '@material-ui/core/FormHelperText'
import InputLabel from '@material-ui/core/InputLabel'
import MenuItem from '@material-ui/core/MenuItem'
import Select from '@material-ui/core/Select'
import { ThemeProvider } from '@material-ui/core/styles'
import TextField from '@material-ui/core/TextField'
import ToggleButton from '@material-ui/lab/ToggleButton'
import ToggleButtonGroup from '@material-ui/lab/ToggleButtonGroup'
import ItemIcon from '@renderer/components/ItemIcon'
import Transfer from '@renderer/components/Transfer'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { theme } from '@renderer/libs/theme'
import { HostsListObjectType } from '@root/common/data'
import React, { useState } from 'react'
import styles from './EditHostsInfo.less'

interface Props {
  hosts?: HostsListObjectType | null;
}

const EditHostsInfo = (props: Props) => {
  const { i18n } = useModel('useI18n')
  const [hosts, setHosts] = useState<HostsListObjectType | null>(props.hosts || null)
  const [is_show, setIsShow] = useState(false)
  const is_add = !props.hosts

  const onCancel = async () => {
    setHosts(null)
    setIsShow(false)
  }

  const onSave = async () => {

  }

  const onUpdate = async (kv: Partial<HostsListObjectType>) => {
    let obj: HostsListObjectType = Object.assign({}, hosts, kv)
    setHosts(obj)
  }

  useOnBroadcast('edit_hosts_info', (hosts?: HostsListObjectType) => {
    setHosts(hosts || null)
    setIsShow(true)
  })

  useOnBroadcast('add_new', () => {
    setHosts(null)
    setIsShow(true)
  })

  const forRemote = (): React.ReactElement => {
    return (
      <>
        <div className={styles.ln}>
          <FormControl component="fieldset" fullWidth={true}>
            {/*<FormLabel component="legend">URL</FormLabel>*/}
            <TextField
              id="hosts_url"
              variant="outlined"
              size="small"
              fullWidth={true}
              label="URL"
              placeholder={i18n.lang.url_placeholder}
              InputLabelProps={{
                shrink: true,
              }}
            />
          </FormControl>
        </div>

        <div className={styles.ln}>
          <FormControl
            component="fieldset"
            fullWidth={true}
            variant="outlined"
            size="small"
          >
            <InputLabel htmlFor="outlined-age-native-simple">{i18n.lang.auto_refresh}</InputLabel>
            <Select
              value={hosts?.refresh_interval || 0}
              label={i18n.lang.auto_refresh}
              inputProps={{
                name: 'age',
                id: 'outlined-age-native-simple',
              }}
              onChange={(e) => onUpdate({
                refresh_interval: e.target.value as number,
              })}
            >
              <MenuItem value={0}>{i18n.lang.never}</MenuItem>
              <MenuItem value={60}>1 {i18n.lang.minute}</MenuItem>
              <MenuItem value={60 * 5}>5 {i18n.lang.minutes}</MenuItem>
              <MenuItem value={60 * 15}>15 {i18n.lang.minutes}</MenuItem>
              <MenuItem value={60 * 60}>1 {i18n.lang.hour}</MenuItem>
              <MenuItem value={60 * 60 * 24}>24 {i18n.lang.hours}</MenuItem>
              <MenuItem value={60 * 60 * 24 * 7}>7 {i18n.lang.days}</MenuItem>
            </Select>
            <FormHelperText>
              {i18n.lang.last_refresh}
              {hosts?.last_refresh || 'N/A'}
            </FormHelperText>
          </FormControl>
        </div>
      </>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      <Dialog
        open={is_show}
        onClose={onCancel}
        maxWidth="lg"
      >
        <DialogTitle id="alert-dialog-title">{is_add ? i18n.lang.hosts_add : i18n.lang.hosts_edit}</DialogTitle>
        <DialogContent style={{ width: 400 }}>
          <div className={styles.ln}>
            <FormControl component="fieldset" fullWidth={true}>
              {/*<FormLabel component="legend">{i18n.lang.hosts_type}</FormLabel>*/}
              <ToggleButtonGroup
                exclusive
                size="small"
                value={hosts?.where || 'local'}
                onChange={(e, where) => onUpdate({ where })}
              >
                <ToggleButton value="local">
                  <ItemIcon where="local"/> {i18n.lang.local}
                </ToggleButton>
                <ToggleButton value="remote">
                  <ItemIcon where="remote"/> {i18n.lang.remote}
                </ToggleButton>
                <ToggleButton value="group">
                  <ItemIcon where="group"/> {i18n.lang.group}
                </ToggleButton>
                <ToggleButton value="folder">
                  <ItemIcon where="folder"/> {i18n.lang.folder}
                </ToggleButton>
              </ToggleButtonGroup>
            </FormControl>
          </div>


          <div className={styles.ln}>
            <FormControl component="fieldset" fullWidth={true}>
              {/*<FormLabel component="legend">{i18n.lang.hosts_title}</FormLabel>*/}
              <TextField
                id="hosts_title"
                label={i18n.lang.hosts_title}
                variant="outlined"
                size="small"
                fullWidth={true}
                value={hosts?.title || ''}
                onChange={(e) => onUpdate({
                  title: e.target.value as string,
                })}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </FormControl>
          </div>

          {hosts?.where === 'remote' ? forRemote() : null}
          {hosts?.where === 'group' ? <Transfer/> : null}
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
