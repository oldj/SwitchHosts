/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Radio,
  RadioGroup,
  Select,
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
    <VStack spacing={4}>
      <FormControl>
        <HStack>
          <FormLabel w={label_width}>{lang.language}</FormLabel>
          <Select
            w="200px"
            value={data.locale}
            onChange={(e) => onChange({ locale: e.target.value as LocaleName })}
          >
            <option value="zh">简体中文</option>
            <option value="zh_hant">繁體中文</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="ja">日本語</option>
            <option value="tr">Türkçe</option>
            <option value="ko">한국어</option>
          </Select>
        </HStack>
      </FormControl>

      <FormControl>
        <HStack>
          <FormLabel w={label_width}>{lang.theme}</FormLabel>
          <Select
            w="200px"
            value={data.theme}
            onChange={(e) => onChange({ theme: e.target.value as ThemeType })}
          >
            <option value="light">{lang.theme_light}</option>
            <option value="dark">{lang.theme_dark}</option>
          </Select>
        </HStack>
      </FormControl>

      <FormControl>
        <HStack alignItems={'flex-start'}>
          <FormLabel w={label_width}>{lang.write_mode}</FormLabel>
          <VStack align="left">
            <RadioGroup
              value={data.write_mode || ''}
              onChange={(v) =>
                onChange({
                  write_mode: v as ConfigsType['write_mode'],
                })
              }
            >
              <HStack spacing={10}>
                <Radio value="append">
                  <Box>{lang.append}</Box>
                </Radio>
                <Radio value="overwrite">
                  <Box>{lang.overwrite}</Box>
                </Radio>
              </HStack>
            </RadioGroup>
            <FormHelperText maxW={'350px'}>
              {data.write_mode === 'append' && lang.write_mode_append_help}
              {data.write_mode === 'overwrite' && lang.write_mode_overwrite_help}
            </FormHelperText>
          </VStack>
        </HStack>
      </FormControl>

      <FormControl pb={6}>
        <HStack alignItems={'flex-start'}>
          <FormLabel w={label_width}>{lang.choice_mode}</FormLabel>
          <VStack align="left">
            <RadioGroup
              value={data.choice_mode.toString()}
              onChange={(v) =>
                onChange({
                  choice_mode: parseInt(v.toString()) as ConfigsType['choice_mode'],
                })
              }
            >
              <HStack spacing={10}>
                <Radio value="1">
                  <Box>{lang.choice_mode_single}</Box>
                </Radio>
                <Radio value="2">
                  <Box>{lang.choice_mode_multiple}</Box>
                </Radio>
              </HStack>
            </RadioGroup>
            <FormHelperText maxW={'350px'}>{lang.choice_mode_desc}</FormHelperText>
          </VStack>
        </HStack>
      </FormControl>

      {platform === 'darwin' ? (
        <FormControl>
          <HStack>
            <Checkbox
              isChecked={data.show_title_on_tray}
              onChange={(e) => onChange({ show_title_on_tray: e.target.checked })}
            >
              {lang.show_title_on_tray}
            </Checkbox>
          </HStack>
        </FormControl>
      ) : null}

      <FormControl>
        <HStack>
          <Checkbox
            isChecked={data.hide_at_launch}
            onChange={(e) => onChange({ hide_at_launch: e.target.checked })}
          >
            {lang.hide_at_launch}
          </Checkbox>
        </HStack>
      </FormControl>

      {agent.platform === 'linux' ? (
        <FormControl>
          <HStack>
            <Checkbox
              isChecked={data.use_system_window_frame}
              onChange={(e) => onChange({ use_system_window_frame: e.target.checked })}
            >
              {lang.use_system_window_frame}
            </Checkbox>
          </HStack>
        </FormControl>
      ) : null}

      {agent.platform === 'darwin' ? (
        <FormControl>
          <HStack>
            <Checkbox
              isChecked={data.hide_dock_icon}
              onChange={(e) => onChange({ hide_dock_icon: e.target.checked })}
            >
              {lang.hide_dock_icon}
            </Checkbox>
          </HStack>
        </FormControl>
      ) : null}

      <FormControl>
        <VStack align="left">
          <Checkbox
            isChecked={data.remove_duplicate_records}
            onChange={(e) => onChange({ remove_duplicate_records: e.target.checked })}
          >
            {lang.remove_duplicate_records}
          </Checkbox>
          <FormHelperText pl="20px">{lang.remove_duplicate_records_desc}</FormHelperText>
        </VStack>
      </FormControl>

      <FormControl>
        <VStack align="left">
          <Checkbox
            isChecked={data.tray_mini_window}
            onChange={(e) => onChange({ tray_mini_window: e.target.checked })}
          >
            {lang.tray_mini_window}
          </Checkbox>
        </VStack>
      </FormControl>

      <FormControl>
        <VStack align="left">
          <Checkbox
            isChecked={data.multi_chose_folder_switch_all}
            onChange={(e) => onChange({ multi_chose_folder_switch_all: e.target.checked })}
          >
            {lang.multi_chose_folder_switch_all}
          </Checkbox>
        </VStack>
      </FormControl>

      <FormControl>
        <VStack align="left">
          <Checkbox
            isChecked={data.http_api_on}
            onChange={(e) => onChange({ http_api_on: e.target.checked })}
          >
            {lang.http_api_on}
          </Checkbox>
          <FormHelperText pl="20px">
            {i18n.trans('http_api_on_desc', [http_api_port.toString()])}
          </FormHelperText>
          <Stack pl={6} mt={1} spacing={1}>
            <Checkbox
              isDisabled={!data.http_api_on}
              isChecked={data.http_api_only_local}
              onChange={(e) => onChange({ http_api_only_local: e.target.checked })}
            >
              {lang.http_api_only_local}
            </Checkbox>
          </Stack>
        </VStack>
      </FormControl>
    </VStack>
  )
}

export default General
