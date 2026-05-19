/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType, ThemeType } from '@common/default_configs'
import { LocaleName } from '@common/i18n'
import { Box, Checkbox, Group, SegmentedControl, Select, Stack } from '@mantine/core'
import DescriptionText, { checkboxDescriptionStyles } from '@renderer/components/DescriptionText'
import { agent } from '@renderer/core/agent'
import useI18n from '@renderer/models/useI18n'
import { normalizeTheme } from '@renderer/utils/theme'
import type { CSSProperties } from 'react'
import { languageOptions, resolveLanguageSelectValue } from './languageOptions'

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
  const { lang, locale } = useI18n()
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
          value={resolveLanguageSelectValue(data.locale, locale)}
          onChange={(v) => v && onChange({ locale: v as LocaleName })}
          data={languageOptions}
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
          checked={data.auto_check_update}
          onChange={(e) => onChange({ auto_check_update: e.target.checked })}
          label={lang.auto_check_update}
          description={lang.auto_check_update_desc}
          styles={checkboxDescriptionStyles}
        />
      </Box>
    </Stack>
  )
}

export default General
