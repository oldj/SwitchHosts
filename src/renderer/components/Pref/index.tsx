/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import events from '@common/events'
import { Button, Group, ScrollArea, Tabs } from '@mantine/core'
import Proxy from '@renderer/components/Pref/Proxy'
import SideDrawer from '@renderer/components/SideDrawer'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useConfigs from '@renderer/models/useConfigs'
import useI18n from '@renderer/models/useI18n'
import { IconAdjustments } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import Advanced from './Advanced'
import Commands from './Commands'
import General from './General'
import styles from './styles.module.scss'

const PreferencePanel = () => {
  const [is_open, setIsOpen] = useState(false)
  const { configs, updateConfigs } = useConfigs()
  const [data, setData] = useState<ConfigsType | null>(configs)
  const { lang } = useI18n()
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
    <SideDrawer
      opened={is_open}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="8px">
          <IconAdjustments size={16} />
          <span>{lang.preferences}</span>
        </Group>
      }
      scrollAreaStyle={{
        overflow: 'hidden',
      }}
      footer={
        <Group justify="flex-end" gap="12px">
          <Button variant="outline" onClick={onClose}>
            {lang.btn_cancel}
          </Button>
          <Button onClick={onSave} color="blue">
            {lang.btn_ok}
          </Button>
        </Group>
      }
    >
      <div style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column' }}>
        <Tabs defaultValue="general" className={styles.tabs}>
          <Tabs.List>
            <Tabs.Tab value="general">{lang.general}</Tabs.Tab>
            <Tabs.Tab value="commands">{lang.commands}</Tabs.Tab>
            <Tabs.Tab value="proxy">{lang.proxy}</Tabs.Tab>
            <Tabs.Tab value="advanced">{lang.advanced}</Tabs.Tab>
          </Tabs.List>
          <div className={styles.tab_panels}>
            <Tabs.Panel value="general" className={styles.tab_panel}>
              <ScrollArea className={styles.scroll_area} offsetScrollbars="y" scrollbars="y">
                <div className={styles.tab_panel_content}>
                  <General data={data} onChange={onUpdate} />
                </div>
              </ScrollArea>
            </Tabs.Panel>
            <Tabs.Panel value="commands" className={styles.tab_panel}>
              <ScrollArea className={styles.scroll_area} offsetScrollbars="y" scrollbars="y">
                <div className={styles.tab_panel_content}>
                  <Commands data={data} onChange={onUpdate} />
                </div>
              </ScrollArea>
            </Tabs.Panel>
            <Tabs.Panel value="proxy" className={styles.tab_panel}>
              <ScrollArea className={styles.scroll_area} offsetScrollbars="y" scrollbars="y">
                <div className={styles.tab_panel_content}>
                  <Proxy data={data} onChange={onUpdate} />
                </div>
              </ScrollArea>
            </Tabs.Panel>
            <Tabs.Panel value="advanced" className={styles.tab_panel}>
              <ScrollArea className={styles.scroll_area} offsetScrollbars="y" scrollbars="y">
                <div className={styles.tab_panel_content}>
                  <Advanced data={data} onChange={onUpdate} />
                </div>
              </ScrollArea>
            </Tabs.Panel>
          </div>
        </Tabs>
      </div>
    </SideDrawer>
  )
}

export default PreferencePanel
