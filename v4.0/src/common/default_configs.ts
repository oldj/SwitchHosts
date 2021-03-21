import { LocaleName } from '@root/common/i18n'
import { FolderModeType } from './data.d'

export type ThemeType = 'light' | 'dark' | 'auto'

const configs = {
  // UI
  left_panel_show: true as boolean,
  left_panel_width: 270 as number,

  // preferences
  history_limit: 50 as number,
  locale: 'zh' as LocaleName,
  theme: 'light' as ThemeType,
  choice_mode: 1 as FolderModeType,
  show_title_on_tray: false as boolean,
  hide_at_launch: false as boolean,
  send_usage_data: false as boolean,
  cmd_after_hosts_apply: '' as string,
  remove_duplicate_records: false,
  hide_dock_icon: false,

  // other
  env: 'PROD' as 'PROD' | 'DEV',
}

export type ConfigsType = typeof configs

export default configs
