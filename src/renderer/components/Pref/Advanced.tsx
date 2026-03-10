/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import { Button, Checkbox, Group, Stack, Tooltip } from '@mantine/core'
import { actions } from '@renderer/core/agent'
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
  const isDisabled = !link
  return (
    <Tooltip label={lang.click_to_open}>
      <a
        className={styles.link}
        onClick={(e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          if (isDisabled) return
          actions.showItemInFolder(link)
        }}
        href={isDisabled ? undefined : 'file://' + link}
        style={{ opacity: isDisabled ? 0.5 : 1, pointerEvents: isDisabled ? 'none' : 'auto' }}
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
    <Stack gap="40px">
      <div style={{ width: '100%' }}>
        <div>{lang.usage_data_title}</div>
        <div style={{ marginBottom: 8, opacity: 0.7, fontSize: 12 }}>{lang.usage_data_help}</div>
        <Checkbox
          checked={data.send_usage_data}
          label={lang.usage_data_agree}
          onChange={(e) => onChange({ send_usage_data: e.target.checked })}
        />
      </div>

      <div style={{ width: '100%' }}>
        <div>{lang.where_is_my_hosts}</div>
        <div style={{ marginBottom: 8, opacity: 0.7, fontSize: 12 }}>{lang.your_hosts_file_is}</div>
        <PathLink link={hosts_path} />
      </div>

      <div style={{ width: '100%' }}>
        <div>{lang.where_is_my_data}</div>
        <div style={{ marginBottom: 8, opacity: 0.7, fontSize: 12 }}>{lang.your_data_is}</div>
        <Group gap="8px">
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
      </div>
    </Stack>
  )
}

export default Advanced
