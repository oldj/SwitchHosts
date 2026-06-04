/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType, ThemeType } from '@common/default_configs'
import { LocaleName } from '@common/i18n'
import { Box, Button, Checkbox, Group, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import DescriptionText, { checkboxDescriptionStyles } from '@renderer/components/DescriptionText'
import { actions, agent } from '@renderer/core/agent'
import useI18n from '@renderer/models/useI18n'
import { normalizeTheme } from '@renderer/utils/theme'
import { type CSSProperties, useEffect, useState } from 'react'
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

  // Privileged-helper state (macOS only). `not_supported` hides the row
  // — that covers non-macOS, macOS < 13, and unsigned/dev builds, where
  // the apply path uses the OS auth prompt instead.
  const [helperStatus, setHelperStatus] = useState<string>('not_supported')
  const [helperBusy, setHelperBusy] = useState(false)
  const [helperMessage, setHelperMessage] = useState<string>('')

  const refreshHelperStatus = async () => {
    try {
      const r = await actions.helperStatus()
      setHelperStatus(r?.status ?? 'not_supported')
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (platform !== 'darwin') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- on-mount status fetch; setState runs after an async round-trip, not synchronously
    refreshHelperStatus()
  }, [platform])

  const runHelperAction = async (action: 'install' | 'repair' | 'uninstall') => {
    setHelperBusy(true)
    setHelperMessage('')
    try {
      const r =
        action === 'install'
          ? await actions.helperInstall()
          : action === 'repair'
            ? await actions.helperRepair()
            : await actions.helperUninstall()
      // Surface backend failures (register/unregister errors) instead of
      // silently leaving the status unchanged.
      if (r && r.success === false) {
        setHelperMessage(r.message ? String(r.message) : lang.fail)
      }
    } catch (e) {
      console.error(e)
      setHelperMessage(String(e))
    } finally {
      await refreshHelperStatus()
      setHelperBusy(false)
    }
  }

  // A fresh install just registers; an outdated/unreachable daemon needs
  // a forceful re-register (unregister + register), since a bare register
  // on an already-registered service may not refresh it.
  const helperPrimaryAction: 'install' | 'repair' =
    helperStatus === 'not_installed' ? 'install' : 'repair'

  const helperStatusText = (() => {
    switch (helperStatus) {
      case 'installed_current':
        return lang.helper_status_installed
      case 'installed_outdated':
        return lang.helper_status_outdated
      case 'installed_unreachable':
        return lang.helper_status_unreachable
      case 'requires_approval':
        return lang.helper_status_requires_approval
      default:
        return lang.helper_status_not_installed
    }
  })()

  const helperInstalled =
    helperStatus === 'installed_current' ||
    helperStatus === 'installed_outdated' ||
    helperStatus === 'installed_unreachable' ||
    helperStatus === 'requires_approval'
  const helperNeedsInstall =
    helperStatus === 'not_installed' ||
    helperStatus === 'installed_outdated' ||
    helperStatus === 'installed_unreachable'

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

      {platform === 'darwin' && helperStatus !== 'not_supported' ? (
        <Box w="100%" mt={20}>
          <Stack gap="8px" align="flex-start">
            <Group gap="8px">
              <Box>{lang.helper_section}</Box>
              <Text size="sm" c="dimmed">
                {helperStatusText}
              </Text>
            </Group>
            <DescriptionText style={{ alignSelf: 'stretch' }}>
              {lang.helper_section_desc}
            </DescriptionText>
            <Group gap="8px">
              {helperNeedsInstall ? (
                <Button
                  size="xs"
                  loading={helperBusy}
                  onClick={() => runHelperAction(helperPrimaryAction)}
                >
                  {helperPrimaryAction === 'repair'
                    ? lang.helper_btn_reinstall
                    : lang.helper_btn_install}
                </Button>
              ) : null}
              {helperInstalled ? (
                <Button
                  size="xs"
                  variant="default"
                  loading={helperBusy}
                  onClick={() => runHelperAction('uninstall')}
                >
                  {lang.helper_btn_remove}
                </Button>
              ) : null}
            </Group>
            {helperMessage ? (
              <Text size="sm" c="red">
                {helperMessage}
              </Text>
            ) : null}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  )
}

export default General
