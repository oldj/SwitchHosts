/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import { Checkbox, Stack, Tooltip } from '@mantine/core'
import { actions } from '@renderer/core/agent'
import useI18n from '@renderer/models/useI18n'
import { IconFile, IconFolder } from '@tabler/icons-react'
import React, { useEffect, useState } from 'react'
import styles from './styles.module.scss'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const PathLink = (props: { link: string; icon?: React.ReactNode }) => {
  const { link, icon } = props
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
        style={{
          opacity: isDisabled ? 0.5 : 1,
          pointerEvents: isDisabled ? 'none' : 'auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {icon}
        {link}
      </a>
    </Tooltip>
  )
}

const Advanced = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useI18n()
  const [hostsPath, setHostsPath] = useState('')
  const [dataDir, setDataDir] = useState('')

  useEffect(() => {
    actions.getPathOfSystemHosts().then((hostsPath) => setHostsPath(hostsPath))
    actions.getDataDir().then((dataDir) => setDataDir(dataDir))
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
        <PathLink link={hostsPath} icon={<IconFile size={16} />} />
      </div>

      <div style={{ width: '100%' }}>
        <div>{lang.where_is_my_data}</div>
        <div style={{ marginBottom: 8, opacity: 0.7, fontSize: 12 }}>{lang.your_data_is}</div>
        <PathLink link={dataDir} icon={<IconFolder size={16} />} />
      </div>
    </Stack>
  )
}

export default Advanced
