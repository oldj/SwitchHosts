/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { http_api_port } from '@common/constants'
import { ConfigsType, ThemeType } from '@common/default_configs'
import { LocaleName } from '@common/i18n'
import { Box, Checkbox, Group, NativeSelect, Radio, Stack, Text } from '@mantine/core'
import { agent } from '@renderer/core/agent'
import useI18n from '@renderer/models/useI18n'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const General = (props: IProps) => {
  const { data, onChange } = props
  const { i18n, lang } = useI18n()
  const { platform } = agent

  const label_width = 80

  return (
    <Stack gap="16px">
      <Box w="100%">
        <Group gap="8px">
          <Box w={label_width}>{lang.language}</Box>
          <NativeSelect
            value={data.locale}
            onChange={(e) => onChange({ locale: e.target.value as LocaleName })}
            data={[
              { value: 'zh', label: '简体中文' },
              { value: 'zh_hant', label: '繁體中文' },
              { value: 'en', label: 'English' },
              { value: 'fr', label: 'Français' },
              { value: 'de', label: 'Deutsch' },
              { value: 'ja', label: '日本語' },
              { value: 'tr', label: 'Türkçe' },
              { value: 'ko', label: '한국어' },
            ]}
            w={200}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group gap="8px">
          <Box w={label_width}>{lang.theme}</Box>
          <NativeSelect
            value={data.theme}
            onChange={(e) => onChange({ theme: e.target.value as ThemeType })}
            data={[
              { value: 'light', label: lang.theme_light },
              { value: 'dark', label: lang.theme_dark },
            ]}
            w={200}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group align="flex-start" gap="8px">
          <Box w={label_width}>{lang.write_mode}</Box>
          <Stack gap="24px">
            <Radio.Group
              value={data.write_mode || ''}
              onChange={(v) => onChange({ write_mode: v as ConfigsType['write_mode'] })}
            >
              <Group gap="40px">
                <Radio value="append" label={lang.append} />
                <Radio value="overwrite" label={lang.overwrite} />
              </Group>
            </Radio.Group>
            <Text maw={350} c="dimmed" size="sm">
              {data.write_mode === 'append' && lang.write_mode_append_help}
              {data.write_mode === 'overwrite' && lang.write_mode_overwrite_help}
            </Text>
          </Stack>
        </Group>
      </Box>

      <Box pb="24px" w="100%">
        <Group align="flex-start" gap="8px">
          <Box w={label_width}>{lang.choice_mode}</Box>
          <Stack gap="24px">
            <Radio.Group
              value={data.choice_mode.toString()}
              onChange={(v) => onChange({ choice_mode: parseInt(v) as ConfigsType['choice_mode'] })}
            >
              <Group gap="40px">
                <Radio value="1" label={lang.choice_mode_single} />
                <Radio value="2" label={lang.choice_mode_multiple} />
              </Group>
            </Radio.Group>
            <Text maw={350} c="dimmed" size="sm">
              {lang.choice_mode_desc}
            </Text>
          </Stack>
        </Group>
      </Box>

      {platform === 'darwin' ? (
        <Box w="100%">
          <Group>
            <Checkbox
              checked={data.show_title_on_tray}
              onChange={(e) => onChange({ show_title_on_tray: e.target.checked })}
              label={lang.show_title_on_tray}
            />
          </Group>
        </Box>
      ) : null}

      <Box w="100%">
        <Group>
          <Checkbox
            checked={data.hide_at_launch}
            onChange={(e) => onChange({ hide_at_launch: e.target.checked })}
            label={lang.hide_at_launch}
          />
        </Group>
      </Box>

      {agent.platform === 'linux' ? (
        <Box w="100%">
          <Group>
            <Checkbox
              checked={data.use_system_window_frame}
              onChange={(e) => onChange({ use_system_window_frame: e.target.checked })}
              label={lang.use_system_window_frame}
            />
          </Group>
        </Box>
      ) : null}

      {agent.platform === 'darwin' ? (
        <Box w="100%">
          <Group>
            <Checkbox
              checked={data.hide_dock_icon}
              onChange={(e) => onChange({ hide_dock_icon: e.target.checked })}
              label={lang.hide_dock_icon}
            />
          </Group>
        </Box>
      ) : null}

      <Box w="100%">
        <Stack gap="16px">
          <Checkbox
            checked={data.remove_duplicate_records}
            onChange={(e) => onChange({ remove_duplicate_records: e.target.checked })}
            label={lang.remove_duplicate_records}
          />
          <Box pl="20px" c="dimmed" fz="sm">
            {lang.remove_duplicate_records_desc}
          </Box>
        </Stack>
      </Box>

      <Box w="100%">
        <Stack gap="16px">
          <Checkbox
            checked={data.tray_mini_window}
            onChange={(e) => onChange({ tray_mini_window: e.target.checked })}
            label={lang.tray_mini_window}
          />
        </Stack>
      </Box>

      <Box w="100%">
        <Stack gap="16px">
          <Checkbox
            checked={data.multi_chose_folder_switch_all}
            onChange={(e) => onChange({ multi_chose_folder_switch_all: e.target.checked })}
            label={lang.multi_chose_folder_switch_all}
          />
        </Stack>
      </Box>

      <Box w="100%">
        <Stack gap="16px">
          <Checkbox
            checked={data.http_api_on}
            onChange={(e) => onChange({ http_api_on: e.target.checked })}
            label={lang.http_api_on}
          />
          <Box pl="20px" c="dimmed" fz="sm">
            {i18n.trans('http_api_on_desc', [http_api_port.toString()])}
          </Box>
          <Stack pl="24px" mt="4px" gap="4px">
            <Checkbox
              disabled={!data.http_api_on}
              checked={data.http_api_only_local}
              onChange={(e) => onChange({ http_api_only_local: e.target.checked })}
              label={lang.http_api_only_local}
            />
          </Stack>
        </Stack>
      </Box>
    </Stack>
  )
}

export default General
