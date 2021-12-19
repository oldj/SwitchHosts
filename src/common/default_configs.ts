import { LocaleName } from '@root/common/i18n'
import { FolderModeType } from './data.d'

export type WriteModeType = null | 'overwrite' | 'append'
export type ThemeType = 'light' | 'dark' | 'system'
export type ProtocolType = 'http' | 'https'
export type DefaultLocaleType = LocaleName | undefined

const configs = {
  // UI
  left_panel_show: true,
  left_panel_width: 270,

  // preferences
  write_mode: null as WriteModeType,
  history_limit: 50,
  locale: undefined as DefaultLocaleType,
  theme: 'light' as ThemeType,
  choice_mode: 2 as FolderModeType,
  show_title_on_tray: false,
  hide_at_launch: false,
  send_usage_data: false,
  cmd_after_hosts_apply: '',
  remove_duplicate_records: false,
  hide_dock_icon: false,
  use_proxy: false,
  proxy_protocol: 'http' as ProtocolType,
  proxy_host: '',
  proxy_port: 0,
  http_api_on: false,
  http_api_only_local: true,

  // other
  env: 'PROD' as 'PROD' | 'DEV',
}

export type ConfigsType = typeof configs

export default configs
