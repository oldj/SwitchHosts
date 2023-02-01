/**
 * Advanced.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

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
import { ConfigsType } from '@common/default_configs'
import useI18n from '@renderer/models/useI18n'
import React, { useEffect, useState } from 'react'
import styles from './styles.module.scss'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const PathLink = (props: { link: string }) => {
  const { link } = props
  const { lang } = useI18n()

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
  const { i18n, lang } = useI18n()
  const [hosts_path, setHostsPath] = useState('')
  const [data_dir, setDataDir] = useState('')
  const [default_data_dir, setDefaultDataDir] = useState('')

  useEffect(() => {
    actions.getPathOfSystemHosts().then((hosts_path) => setHostsPath(hosts_path))
    actions.getDataDir().then((data_dir) => setDataDir(data_dir))
    actions.getDefaultDataDir().then((default_data_dir) => setDefaultDataDir(default_data_dir))
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
          <PathLink link={data_dir} />
          <Button
            variant="link"
            onClick={async () => {
              let r = await actions.cmdChangeDataDir()
              console.log(r)
            }}
          >
            {lang.change}
          </Button>

          {data_dir !== default_data_dir && (
            <Button
              variant="link"
              onClick={async () => {
                if (!confirm(i18n.trans('reset_data_dir_confirm', [default_data_dir]))) {
                  return
                }
                let r = await actions.cmdChangeDataDir(true)
                console.log(r)
              }}
            >
              {lang.reset}
            </Button>
          )}
        </HStack>
      </FormControl>
    </VStack>
  )
}

export default Advanced
