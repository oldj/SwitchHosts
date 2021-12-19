/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import {
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Link,
  Tooltip,
  VStack,
} from '@chakra-ui/react'
import { actions } from '@renderer/core/agent'
import { ConfigsType } from '@root/common/default_configs'
import React, { useEffect, useState } from 'react'
import styles from './styles.less'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const PathLink = (props: { link: string }) => {
  const { link } = props
  const { lang } = useModel('useI18n')

  return (
    <Tooltip label={lang.click_to_open}>
      <Link
        className={styles.link}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          actions.showItemInFolder(link)
        }}
        href={'file://' + link}
      >
        {link}
      </Link>
    </Tooltip>
  )
}

const Advanced = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useModel('useI18n')
  const [hosts_path, setHostsPath] = useState('')
  const [data_path, setDataPath] = useState('')

  useEffect(() => {
    actions
      .getPathOfSystemHosts()
      .then((hosts_path) => setHostsPath(hosts_path))
    actions.getDataFolder().then((data_path) => setDataPath(data_path))
  }, [])

  return (
    <VStack spacing={10}>
      <FormControl>
        <FormLabel>{lang.usage_data_title}</FormLabel>
        <FormHelperText mb={2}>{lang.usage_data_help}</FormHelperText>
        <Checkbox
          isChecked={data.send_usage_data}
          onChange={(e) => onChange({ send_usage_data: e.target.checked })}
        >
          {lang.usage_data_agree}
        </Checkbox>
      </FormControl>

      <FormControl>
        <FormLabel>{lang.where_is_my_hosts}</FormLabel>
        <FormHelperText mb={2}>{lang.your_hosts_file_is}</FormHelperText>
        <PathLink link={hosts_path} />
      </FormControl>

      <FormControl>
        <FormLabel>{lang.where_is_my_data}</FormLabel>
        <FormHelperText mb={2}>{lang.your_data_is}</FormHelperText>
        <HStack>
          <PathLink link={data_path} />
          <Button
            variant="link"
            onClick={async () => {
              let r = await actions.cmdChangeDataDir()
              console.log(r)
            }}
          >
            {lang.change}
          </Button>
        </HStack>
      </FormControl>
    </VStack>
  )
}

export default Advanced
