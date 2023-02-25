/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import Proxy from '@renderer/components/Pref/Proxy'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { ConfigsType } from '@common/default_configs'
import events from '@common/events'
import useConfigs from '@renderer/models/useConfigs'
import useI18n from '@renderer/models/useI18n'
import React, { useEffect, useState } from 'react'
import { BiSliderAlt } from 'react-icons/bi'
import Advanced from './Advanced'
import Commands from './Commands'
import General from './General'
import styles from './styles.module.scss'
import { Button, Drawer, Group, Tabs, useMantineColorScheme, useMantineTheme } from '@mantine/core'

const PreferencePanel = () => {
  const theme = useMantineTheme()
  const [is_open, setIsOpen] = useState(false)
  const { configs, updateConfigs } = useConfigs()
  const [data, setData] = useState<ConfigsType | null>(configs)
  const { lang } = useI18n()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()

  const onClose = () => {
    setIsOpen(false)
    setData(configs)
  }

  const onUpdate = (kv: Partial<ConfigsType>) => {
    if (!data) return
    setData({ ...data, ...kv })
  }

  const onSave = async () => {
    if (!data) return
    await updateConfigs(data)
    setIsOpen(false)

    if (colorScheme !== data.theme) {
      toggleColorScheme(data.theme)
    }

    agent.broadcast(events.config_updated, data)
  }

  useEffect(() => {
    setData(configs)
  }, [configs])

  useOnBroadcast(events.show_preferences, async () => {
    setIsOpen(true)
  })

  if (!data) {
    console.log('invalid config data!')
    return null
  }

  return (
    <Drawer
      size="640px"
      opened={is_open}
      position="right"
      onClose={onClose}
      overlayColor={theme.colorScheme === 'dark' ? theme.colors.dark[9] : theme.colors.gray[2]}
      overlayOpacity={0.55}
      overlayBlur={3}
      padding="lg"
      title={
        <div className={styles.title}>
          <BiSliderAlt />
          <span>{lang.preferences}</span>
        </div>
      }
      className={styles.root}
    >
      <Tabs className={styles.tabs} defaultValue={'general'}>
        <Tabs.List>
          <Tabs.Tab fz={'md'} value={'general'}>
            {lang.general}
          </Tabs.Tab>
          <Tabs.Tab fz={'md'} value={'commands'}>
            {lang.commands}
          </Tabs.Tab>
          <Tabs.Tab fz={'md'} value={'proxy'}>
            {lang.proxy}
          </Tabs.Tab>
          <Tabs.Tab fz={'md'} value={'advanced'}>
            {lang.advanced}
          </Tabs.Tab>
        </Tabs.List>

        <div className={styles.tab_panels}>
          <Tabs.Panel value={'general'}>
            <General data={data} onChange={onUpdate} />
          </Tabs.Panel>
          <Tabs.Panel value={'commands'}>
            <Commands data={data} onChange={onUpdate} />
          </Tabs.Panel>
          <Tabs.Panel value={'proxy'}>
            <Proxy data={data} onChange={onUpdate} />
          </Tabs.Panel>
          <Tabs.Panel value={'advanced'}>
            <Advanced data={data} onChange={onUpdate} />
          </Tabs.Panel>
        </div>
      </Tabs>

      <Group position={'right'}>
        <Button variant="outline" onClick={onClose} mr={3}>
          {lang.btn_cancel}
        </Button>
        <Button onClick={onSave}>{lang.btn_ok}</Button>
      </Group>
    </Drawer>
  )
}

export default PreferencePanel
