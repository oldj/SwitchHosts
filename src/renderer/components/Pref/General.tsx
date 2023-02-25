/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { agent } from '@renderer/core/agent'
import { http_api_port } from '@common/constants'
import { ConfigsType, ThemeType } from '@common/default_configs'
import { LocaleName } from '@common/i18n'
import useI18n from '@renderer/models/useI18n'
import React from 'react'
import { Alert, Checkbox, Group, Radio, Select, Stack, Tooltip } from '@mantine/core'
import { IconAlertCircle, IconHelp } from '@tabler/icons-react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const General = (props: IProps) => {
  const { data, onChange } = props
  const { i18n, lang } = useI18n()
  const { platform } = agent

  return (
    <Stack justify={'flex-start'} spacing={'lg'}>
      <Stack align={'flex-start'}>
        <Select
          label={lang.language}
          data={[
            { label: '简体中文', value: 'zh' },
            { label: 'English', value: 'en' },
            { label: 'Français', value: 'fr' },
            { label: 'Deutsch', value: 'de' },
            { label: '日本語', value: 'ja' },
          ]}
          value={data.locale}
          onChange={(val) => onChange({ locale: val as LocaleName })}
        />
      </Stack>

      <Stack align={'flex-start'}>
        <Select
          label={lang.theme}
          data={[
            { label: lang.theme_light, value: 'light' },
            { label: lang.theme_dark, value: 'dark' },
          ]}
          value={data.theme}
          onChange={(val) => onChange({ theme: val as ThemeType })}
        />
      </Stack>

      <Stack align={'flex-start'}>
        <Radio.Group
          label={lang.write_mode}
          value={data.write_mode || ''}
          onChange={(v) =>
            onChange({
              write_mode: v as ConfigsType['write_mode'],
            })
          }
        >
          <Radio value="append" label={lang.append} />
          <Radio value="overwrite" label={lang.overwrite} />
        </Radio.Group>
        <Alert icon={<IconAlertCircle />} color="orange">
          {data.write_mode === 'append' && lang.write_mode_append_help}
          {data.write_mode === 'overwrite' && lang.write_mode_overwrite_help}
        </Alert>
      </Stack>

      <Stack align={'flex-start'} mb={10}>
        <Radio.Group
          label={
            <Group>
              <span>{lang.choice_mode}</span>
              <Tooltip label={lang.choice_mode_desc} withArrow arrowSize={10}>
                <IconHelp size={16} stroke={1.5} />
              </Tooltip>
            </Group>
          }
          value={data.choice_mode.toString()}
          onChange={(v) =>
            onChange({
              choice_mode: parseInt(v.toString()) as ConfigsType['choice_mode'],
            })
          }
        >
          <Radio value="1" label={lang.choice_mode_single} />
          <Radio value="2" label={lang.choice_mode_multiple} />
        </Radio.Group>
      </Stack>

      <Stack spacing={'sm'}>
        {platform === 'darwin' ? (
          <Stack>
            <Checkbox
              label={lang.show_title_on_tray}
              checked={data.show_title_on_tray}
              onChange={(e) => onChange({ show_title_on_tray: e.target.checked })}
            />
          </Stack>
        ) : null}

        <Stack>
          <Checkbox
            label={lang.hide_at_launch}
            checked={data.hide_at_launch}
            onChange={(e) => onChange({ hide_at_launch: e.target.checked })}
          />
        </Stack>

        {agent.platform === 'linux' ? (
          <Stack>
            <Checkbox
              label={lang.use_system_window_frame}
              checked={data.use_system_window_frame}
              onChange={(e) => onChange({ use_system_window_frame: e.target.checked })}
            />
          </Stack>
        ) : null}

        {agent.platform === 'darwin' ? (
          <Stack>
            <Checkbox
              label={lang.hide_dock_icon}
              checked={data.hide_dock_icon}
              onChange={(e) => onChange({ hide_dock_icon: e.target.checked })}
            />
          </Stack>
        ) : null}

        <Stack>
          <Checkbox
            label={
              <Group>
                <span>{lang.remove_duplicate_records}</span>
                <Tooltip label={lang.remove_duplicate_records_desc} withArrow arrowSize={10}>
                  <IconHelp size={16} stroke={1.5} />
                </Tooltip>
              </Group>
            }
            checked={data.remove_duplicate_records}
            onChange={(e) => onChange({ remove_duplicate_records: e.target.checked })}
          />
        </Stack>

        <Stack>
          <Checkbox
            label={lang.tray_mini_window}
            checked={data.tray_mini_window}
            onChange={(e) => onChange({ tray_mini_window: e.target.checked })}
          />
        </Stack>

        <Stack>
          <Checkbox
            label={lang.multi_chose_folder_switch_all}
            checked={data.multi_chose_folder_switch_all}
            onChange={(e) => onChange({ multi_chose_folder_switch_all: e.target.checked })}
          />
        </Stack>

        <Stack>
          <Checkbox
            label={
              <Group>
                <span>{lang.http_api_on}</span>
                <Tooltip
                  label={i18n.trans('http_api_on_desc', [http_api_port.toString()])}
                  withArrow
                  arrowSize={10}
                >
                  <IconHelp size={16} stroke={1.5} />
                </Tooltip>
              </Group>
            }
            checked={data.http_api_on}
            onChange={(e) => onChange({ http_api_on: e.target.checked })}
          />
          <Stack>
            <Checkbox
              label={lang.http_api_only_local}
              disabled={!data.http_api_on}
              checked={data.http_api_only_local}
              onChange={(e) => onChange({ http_api_only_local: e.target.checked })}
            />
          </Stack>
        </Stack>
      </Stack>
    </Stack>
  )
}

export default General
