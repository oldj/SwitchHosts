import * as fs from 'fs'

import { atomicWrite } from './paths'

export type AppConfig = Record<string, unknown>

const CONFIG_FORMAT = 'switchhosts-config'
const CONFIG_SCHEMA_VERSION = 1

export const DEFAULT_CONFIG: AppConfig = {
  left_panel_show: true,
  left_panel_width: 270,
  right_panel_show: false,
  right_panel_width: 240,
  use_system_window_frame: false,
  write_mode: 'append',
  history_limit: 50,
  locale: undefined,
  theme: 'system',
  choice_mode: 2,
  show_title_on_tray: false,
  launch_at_login: false,
  hide_at_launch: false,
  send_usage_data: false,
  cmd_after_hosts_apply: '',
  remove_duplicate_records: false,
  hide_dock_icon: false,
  use_proxy: false,
  proxy_protocol: 'http',
  proxy_host: '',
  proxy_port: 0,
  refresh_remote_hosts_on_startup: false,
  http_api_on: false,
  http_api_only_local: true,
  tray_mini_window: true,
  multi_chose_folder_switch_all: false,
  auto_check_update: true,
  find_is_regexp: false,
  find_is_ignore_case: false,
  find_result_column_widths: [],
  env: 'PROD',
}

export function loadConfig(configFile: string): AppConfig {
  if (!fs.existsSync(configFile)) {
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8')) as Record<string, unknown>
    const merged = { ...DEFAULT_CONFIG }
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (key in raw) {
        merged[key] = raw[key]
      }
    }
    return merged
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(configFile: string, config: AppConfig): void {
  const payload = {
    ...config,
    format: CONFIG_FORMAT,
    schemaVersion: CONFIG_SCHEMA_VERSION,
  }
  atomicWrite(configFile, JSON.stringify(payload, null, 2))
}

export function applyConfigPatch(current: AppConfig, patch: Record<string, unknown>): AppConfig {
  const next = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_CONFIG)) {
      throw new Error(`Unknown config key: ${key}`)
    }
    next[key] = value
  }
  return next
}

export function getConfigKey(config: AppConfig, key: string): unknown {
  return key in config ? config[key] : null
}
