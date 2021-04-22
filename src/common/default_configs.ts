import { LocaleName } from '@root/common/i18n'
import { FolderModeType } from './data.d'

export type ThemeType = 'light' | 'dark' | 'auto'
export type ProtocolType = 'http' | 'https'

const configs = {
  // UI
  left_panel_show: true,
  left_panel_width: 270,

  // preferences
  history_limit: 50,
  locale: 'zh' as LocaleName,
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

  // other
  env: 'PROD' as 'PROD' | 'DEV',
}

export type ConfigsType = typeof configs

export default configs
