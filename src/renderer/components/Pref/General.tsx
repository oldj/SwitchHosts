/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Checkbox,
  HStack,
  Stack,
  VStack,
} from '@chakra-ui/react'
import { agent } from '@renderer/core/agent'
import { http_api_port } from '@common/constants'
import { ConfigsType, ThemeType } from '@common/default_configs'
import { LocaleName } from '@common/i18n'
import useI18n from '@renderer/models/useI18n'
import React from 'react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const General = (props: IProps) => {
  const { data, onChange } = props
  const { i18n, lang } = useI18n()
  const { platform } = agent

  const label_width = 20

  return (
    <VStack gap={4}>
      <Box w="100%">
        <HStack>
          <Box w={label_width}>{lang.language}</Box>
          <select
            value={data.locale}
            onChange={(e) => onChange({ locale: e.target.value as LocaleName })}
            style={{ width: '200px', padding: '6px 10px' }}
          >
            <option value="zh">简体中文</option>
            <option value="zh_hant">繁體中文</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="ja">日本語</option>
            <option value="tr">Türkçe</option>
            <option value="ko">한국어</option>
          </select>
        </HStack>
      </Box>

      <Box w="100%">
        <HStack>
          <Box w={label_width}>{lang.theme}</Box>
          <select
            value={data.theme}
            onChange={(e) => onChange({ theme: e.target.value as ThemeType })}
            style={{ width: '200px', padding: '6px 10px' }}
          >
            <option value="light">{lang.theme_light}</option>
            <option value="dark">{lang.theme_dark}</option>
          </select>
        </HStack>
      </Box>

      <Box w="100%">
        <HStack alignItems={'flex-start'}>
          <Box w={label_width}>{lang.write_mode}</Box>
          <VStack align="left">
            <HStack gap={10}>
              <label>
                <input
                  type="radio"
                  name="write_mode"
                  value="append"
                  checked={(data.write_mode || '') === 'append'}
                  onChange={(e) => onChange({ write_mode: e.target.value as ConfigsType['write_mode'] })}
                />
                  <Box>{lang.append}</Box>
              </label>
              <label>
                <input
                  type="radio"
                  name="write_mode"
                  value="overwrite"
                  checked={(data.write_mode || '') === 'overwrite'}
                  onChange={(e) => onChange({ write_mode: e.target.value as ConfigsType['write_mode'] })}
                />
                  <Box>{lang.overwrite}</Box>
              </label>
            </HStack>
            <Box maxW={'350px'} opacity={0.7} fontSize="sm">
              {data.write_mode === 'append' && lang.write_mode_append_help}
              {data.write_mode === 'overwrite' && lang.write_mode_overwrite_help}
            </Box>
          </VStack>
        </HStack>
      </Box>

      <Box pb={6} w="100%">
        <HStack alignItems={'flex-start'}>
          <Box w={label_width}>{lang.choice_mode}</Box>
          <VStack align="left">
            <HStack gap={10}>
              <label>
                <input
                  type="radio"
                  name="choice_mode"
                  value="1"
                  checked={data.choice_mode.toString() === '1'}
                  onChange={(e) =>
                    onChange({
                      choice_mode: parseInt(e.target.value) as ConfigsType['choice_mode'],
                    })
                  }
                />
                  <Box>{lang.choice_mode_single}</Box>
              </label>
              <label>
                <input
                  type="radio"
                  name="choice_mode"
                  value="2"
                  checked={data.choice_mode.toString() === '2'}
                  onChange={(e) =>
                    onChange({
                      choice_mode: parseInt(e.target.value) as ConfigsType['choice_mode'],
                    })
                  }
                />
                  <Box>{lang.choice_mode_multiple}</Box>
              </label>
            </HStack>
            <Box maxW={'350px'} opacity={0.7} fontSize="sm">
              {lang.choice_mode_desc}
            </Box>
          </VStack>
        </HStack>
      </Box>

      {platform === 'darwin' ? (
        <Box w="100%">
          <HStack>
            <Checkbox.Root
              checked={data.show_title_on_tray}
              onCheckedChange={(e: { checked: boolean }) => onChange({ show_title_on_tray: !!e.checked })}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <span>{lang.show_title_on_tray}</span>
            </Checkbox.Root>
          </HStack>
        </Box>
      ) : null}

      <Box w="100%">
        <HStack>
          <Checkbox.Root
            checked={data.hide_at_launch}
            onCheckedChange={(e: { checked: boolean }) => onChange({ hide_at_launch: !!e.checked })}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <span>{lang.hide_at_launch}</span>
          </Checkbox.Root>
        </HStack>
      </Box>

      {agent.platform === 'linux' ? (
        <Box w="100%">
          <HStack>
            <Checkbox.Root
              checked={data.use_system_window_frame}
              onCheckedChange={(e: { checked: boolean }) => onChange({ use_system_window_frame: !!e.checked })}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <span>{lang.use_system_window_frame}</span>
            </Checkbox.Root>
          </HStack>
        </Box>
      ) : null}

      {agent.platform === 'darwin' ? (
        <Box w="100%">
          <HStack>
            <Checkbox.Root
              checked={data.hide_dock_icon}
              onCheckedChange={(e: { checked: boolean }) => onChange({ hide_dock_icon: !!e.checked })}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <span>{lang.hide_dock_icon}</span>
            </Checkbox.Root>
          </HStack>
        </Box>
      ) : null}

      <Box w="100%">
        <VStack align="left">
          <Checkbox.Root
            checked={data.remove_duplicate_records}
            onCheckedChange={(e: { checked: boolean }) => onChange({ remove_duplicate_records: !!e.checked })}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <span>{lang.remove_duplicate_records}</span>
          </Checkbox.Root>
          <Box pl="20px" opacity={0.7} fontSize="sm">
            {lang.remove_duplicate_records_desc}
          </Box>
        </VStack>
      </Box>

      <Box w="100%">
        <VStack align="left">
          <Checkbox.Root
            checked={data.tray_mini_window}
            onCheckedChange={(e: { checked: boolean }) => onChange({ tray_mini_window: !!e.checked })}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <span>{lang.tray_mini_window}</span>
          </Checkbox.Root>
        </VStack>
      </Box>

      <Box w="100%">
        <VStack align="left">
          <Checkbox.Root
            checked={data.multi_chose_folder_switch_all}
            onCheckedChange={(e: { checked: boolean }) => onChange({ multi_chose_folder_switch_all: !!e.checked })}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <span>{lang.multi_chose_folder_switch_all}</span>
          </Checkbox.Root>
        </VStack>
      </Box>

      <Box w="100%">
        <VStack align="left">
          <Checkbox.Root
            checked={data.http_api_on}
            onCheckedChange={(e: { checked: boolean }) => onChange({ http_api_on: !!e.checked })}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <span>{lang.http_api_on}</span>
          </Checkbox.Root>
          <Box pl="20px" opacity={0.7} fontSize="sm">
            {i18n.trans('http_api_on_desc', [http_api_port.toString()])}
          </Box>
          <Stack pl={6} mt={1} gap={1}>
            <Checkbox.Root
              disabled={!data.http_api_on}
              checked={data.http_api_only_local}
              onCheckedChange={(e: { checked: boolean }) => onChange({ http_api_only_local: !!e.checked })}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control />
              <span>{lang.http_api_only_local}</span>
            </Checkbox.Root>
          </Stack>
        </VStack>
      </Box>
    </VStack>
  )
}

export default General
