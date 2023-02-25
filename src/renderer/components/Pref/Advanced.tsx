/**
 * Advanced.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/core/agent'
import { ConfigsType } from '@common/default_configs'
import useI18n from '@renderer/models/useI18n'
import React, { useEffect, useState } from 'react'
import styles from './styles.module.scss'
import { Button, Checkbox, Group, Stack, Tooltip } from '@mantine/core'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const PathLink = (props: { link: string }) => {
  const { link } = props
  const { lang } = useI18n()

  return (
    <Tooltip label={lang.click_to_open} withArrow arrowSize={10}>
      <a
        className={styles.link}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          actions.showItemInFolder(link)
        }}
        href={'file://' + link}
      >
        {link}
      </a>
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
    <Stack spacing={'xl'}>
      <Stack spacing={8}>
        <h3>{lang.usage_data_title}</h3>
        <div className={styles.info}>{lang.usage_data_help}</div>
        <Checkbox
          label={lang.usage_data_agree}
          checked={data.send_usage_data}
          onChange={(e) => onChange({ send_usage_data: e.target.checked })}
        />
      </Stack>

      <Stack align={'flex-start'} spacing={8}>
        <h3>{lang.where_is_my_hosts}</h3>
        <div className={styles.info}>{lang.your_hosts_file_is}</div>
        <PathLink link={hosts_path} />
      </Stack>

      <Stack align={'flex-start'} spacing={8}>
        <h3>{lang.where_is_my_data}</h3>
        <div className={styles.info}>{lang.your_data_is}</div>
        <Group>
          <PathLink link={data_dir} />
          <Button
            variant="subtle"
            onClick={async () => {
              let r = await actions.cmdChangeDataDir()
              console.log(r)
            }}
          >
            {lang.change}
          </Button>

          {data_dir !== default_data_dir && (
            <Button
              variant="subtle"
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
        </Group>
      </Stack>
    </Stack>
  )
}

export default Advanced
