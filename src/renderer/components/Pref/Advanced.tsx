/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { httpApiPort } from '@common/constants'
import { ConfigsType } from '@common/default_configs'
import { Box, Checkbox, Stack, Tooltip } from '@mantine/core'
import DescriptionText, { checkboxDescriptionStyles } from '@renderer/components/DescriptionText'
import { actions, agent } from '@renderer/core/agent'
import useI18n from '@renderer/models/useI18n'
import { IconFile, IconFolder } from '@tabler/icons-react'
import React, { useEffect, useState } from 'react'
import styles from './styles.module.scss'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const PathLink = (props: { link: string; icon?: React.ReactNode }) => {
  const { link, icon } = props
  const { lang } = useI18n()
  const isDisabled = !link
  return (
    <Tooltip label={lang.click_to_open}>
      <a
        className={styles.link}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          if (isDisabled) return
          actions.showItemInFolder(link)
        }}
        href={isDisabled ? undefined : 'file://' + link}
        style={{
          opacity: isDisabled ? 0.5 : 1,
          pointerEvents: isDisabled ? 'none' : 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {icon}
        {link}
      </a>
    </Tooltip>
  )
}

const Advanced = (props: IProps) => {
  const { data, onChange } = props
  const { i18n, lang } = useI18n()
  const { platform } = agent
  const [hostsPath, setHostsPath] = useState('')
  const [dataDir, setDataDir] = useState('')

  useEffect(() => {
    actions.getPathOfSystemHosts().then((hostsPath) => setHostsPath(hostsPath))
    actions.getDataDir().then((dataDir) => setDataDir(dataDir))
  }, [])

  return (
    <Stack gap="40px" pb={60}>
      <Stack gap="16px" w="100%">
        {platform === 'darwin' ? (
          <Box w="100%">
            <Checkbox
              checked={data.show_title_on_tray}
              onChange={(e) => onChange({ show_title_on_tray: e.target.checked })}
              label={lang.show_title_on_tray}
            />
          </Box>
        ) : null}

        <Box w="100%">
          <Checkbox
            checked={data.remove_duplicate_records}
            onChange={(e) => onChange({ remove_duplicate_records: e.target.checked })}
            label={lang.remove_duplicate_records}
            description={lang.remove_duplicate_records_desc}
            styles={checkboxDescriptionStyles}
          />
        </Box>

        <Box w="100%">
          <Checkbox
            checked={data.refresh_remote_hosts_on_startup}
            onChange={(e) => onChange({ refresh_remote_hosts_on_startup: e.target.checked })}
            label={lang.refresh_remote_hosts_on_startup}
            description={lang.refresh_remote_hosts_on_startup_desc}
            styles={checkboxDescriptionStyles}
          />
        </Box>

        <Box w="100%">
          <Checkbox
            checked={data.multi_chose_folder_switch_all}
            onChange={(e) => onChange({ multi_chose_folder_switch_all: e.target.checked })}
            label={lang.multi_chose_folder_switch_all}
            description={lang.multi_chose_folder_switch_all_desc}
            styles={checkboxDescriptionStyles}
          />
        </Box>

        <Box w="100%">
          <Checkbox
            checked={data.tray_mini_window}
            onChange={(e) => onChange({ tray_mini_window: e.target.checked })}
            label={lang.tray_mini_window}
          />
        </Box>

        <Box w="100%">
          <Checkbox
            checked={data.lightweight_mode}
            onChange={(e) => onChange({ lightweight_mode: e.target.checked })}
            label={lang.lightweight_mode}
            description={lang.lightweight_mode_desc}
            styles={checkboxDescriptionStyles}
          />
        </Box>

        <Box w="100%">
          <Stack gap="8px">
            <Checkbox
              checked={data.http_api_on}
              onChange={(e) => onChange({ http_api_on: e.target.checked })}
              label={lang.http_api_on}
              description={i18n.trans('http_api_on_desc', [httpApiPort.toString()])}
              styles={checkboxDescriptionStyles}
            />
            <Box pl="28px">
              <Checkbox
                disabled={!data.http_api_on}
                checked={data.http_api_only_local}
                onChange={(e) => onChange({ http_api_only_local: e.target.checked })}
                label={lang.http_api_only_local}
              />
            </Box>
          </Stack>
        </Box>
      </Stack>

      <div style={{ width: '100%' }}>
        <div>{lang.usage_data_title}</div>
        <DescriptionText mb="8px">{lang.usage_data_help}</DescriptionText>
        <Checkbox
          checked={data.send_usage_data}
          label={lang.usage_data_agree}
          onChange={(e) => onChange({ send_usage_data: e.target.checked })}
        />
      </div>

      <div style={{ width: '100%' }}>
        <div>{lang.where_is_my_hosts}</div>
        <DescriptionText mb="8px">{lang.your_hosts_file_is}</DescriptionText>
        <PathLink link={hostsPath} icon={<IconFile size={16} />} />
      </div>

      <div style={{ width: '100%' }}>
        <div>{lang.where_is_my_data}</div>
        <DescriptionText mb="8px">{lang.your_data_is}</DescriptionText>
        <PathLink link={dataDir} icon={<IconFolder size={16} />} />
      </div>
    </Stack>
  )
}

export default Advanced
