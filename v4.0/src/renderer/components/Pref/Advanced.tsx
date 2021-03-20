/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import {
  Box,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Tooltip,
  VStack,
} from '@chakra-ui/react'
import { actions } from '@renderer/core/agent'
import { ConfigsType } from '@root/common/default_configs'
import React, { useEffect, useState } from 'react'

interface IProps {
  data: ConfigsType;
  onChange: (kv: Partial<ConfigsType>) => void;
}

const PathLink = (props: { link: string }) => {
  const { link } = props
  const { lang } = useModel('useI18n')

  return (
    <Box
      display="inline-block"
      cursor="pointer"
      textDecoration="underline"
      onClick={(e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        actions.showItemInFolder(link)
      }}
    >
      <Tooltip label={lang.click_to_open}>{link}</Tooltip>
    </Box>
  )
}

const Advanced = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useModel('useI18n')
  const [ hosts_path, setHostsPath ] = useState('')
  const [ data_path, setDataPath ] = useState('')

  useEffect(() => {
    actions.getPathOfSystemHosts()
      .then(hosts_path => setHostsPath(hosts_path))
    actions.getDataFolder()
      .then(data_path => setDataPath(data_path))
  }, [])

  return (
    <VStack spacing={10}>
      <FormControl>
        <FormLabel>{lang.usage_data_title}</FormLabel>
        <FormHelperText mb={2}>{lang.usage_data_help}</FormHelperText>
        <Checkbox
          isChecked={data.send_usage_data}
          onChange={e => onChange({ send_usage_data: e.target.checked })}
        >
          {lang.usage_data_agree}
        </Checkbox>
      </FormControl>

      <FormControl>
        <FormLabel>{lang.where_is_my_hosts}</FormLabel>
        <FormHelperText mb={2}>{lang.your_hosts_file_is}</FormHelperText>
        <PathLink link={hosts_path}/>
      </FormControl>

      <FormControl>
        <FormLabel>{lang.where_is_my_data}</FormLabel>
        <FormHelperText mb={2}>{lang.your_data_is}</FormHelperText>
        <PathLink link={data_path}/>
      </FormControl>
    </VStack>
  )
}

export default Advanced
