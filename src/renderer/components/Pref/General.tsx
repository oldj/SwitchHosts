/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { httpApiPort } from '@common/constants'
import { ConfigsType, ThemeType } from '@common/default_configs'
import { LocaleName } from '@common/i18n'
import { Box, Checkbox, Group, SegmentedControl, Select, Stack } from '@mantine/core'
import DescriptionText, { checkboxDescriptionStyles } from '@renderer/components/DescriptionText'
import { agent } from '@renderer/core/agent'
import useI18n from '@renderer/models/useI18n'
import { normalizeTheme } from '@renderer/utils/theme'
import type { CSSProperties } from 'react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const segmentedControlLabelStyle: CSSProperties = {
  alignSelf: 'start',
  display: 'flex',
  alignItems: 'center',
  minHeight: 'calc(2.25rem * var(--mantine-scale))',
}

const General = (props: IProps) => {
  const { data, onChange } = props
  const { i18n, lang } = useI18n()
  const { platform } = agent

  return (
    <Stack gap="16px" pb={60}>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          columnGap: 16,
          rowGap: 16,
          alignItems: 'center',
        }}
      >
        <Box>{lang.language}</Box>
        <Select
          value={data.locale}
          onChange={(v) => v && onChange({ locale: v as LocaleName })}
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
          allowDeselect={false}
        />

        <Box>{lang.theme}</Box>
        <SegmentedControl
          value={normalizeTheme(data.theme)}
          onChange={(v) => onChange({ theme: v as ThemeType })}
          data={[
            { value: 'light', label: lang.theme_light },
            { value: 'dark', label: lang.theme_dark },
            { value: 'system', label: lang.theme_system },
          ]}
          style={{ justifySelf: 'start' }}
        />

        <Box style={segmentedControlLabelStyle}>{lang.write_mode}</Box>
        <Stack gap="8px" align="flex-start">
          <SegmentedControl
            value={data.write_mode || 'append'}
            onChange={(v) => onChange({ write_mode: v as ConfigsType['write_mode'] })}
            data={[
              { value: 'append', label: lang.append },
              { value: 'overwrite', label: lang.overwrite },
            ]}
          />
          <DescriptionText style={{ alignSelf: 'stretch' }}>
            {data.write_mode === 'append' && lang.write_mode_append_help}
            {data.write_mode === 'overwrite' && lang.write_mode_overwrite_help}
          </DescriptionText>
        </Stack>

        <Box style={segmentedControlLabelStyle}>{lang.choice_mode}</Box>
        <Stack gap="8px" align="flex-start">
          <SegmentedControl
            value={data.choice_mode.toString()}
            onChange={(v) => onChange({ choice_mode: parseInt(v) as ConfigsType['choice_mode'] })}
            data={[
              { value: '1', label: lang.choice_mode_single },
              { value: '2', label: lang.choice_mode_multiple },
            ]}
          />
          <DescriptionText style={{ alignSelf: 'stretch' }}>
            {lang.choice_mode_desc}
          </DescriptionText>
        </Stack>
      </Box>

      <Box w="100%">
        <Group>
          <Checkbox
            checked={data.launch_at_login}
            onChange={(e) => onChange({ launch_at_login: e.target.checked })}
            label={lang.launch_at_login}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group>
          <Checkbox
            checked={data.hide_at_launch}
            onChange={(e) => onChange({ hide_at_launch: e.target.checked })}
            label={lang.hide_at_launch}
          />
        </Group>
      </Box>

      {platform === 'darwin' ? (
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

      {platform === 'linux' ? (
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
            description={lang.multi_chose_folder_switch_all_desc}
            styles={checkboxDescriptionStyles}
          />
        </Stack>
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
  )
}

export default General
