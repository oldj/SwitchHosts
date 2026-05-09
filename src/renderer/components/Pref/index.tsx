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
import { IconAdjustments, IconCheck, IconDeviceFloppy } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import Advanced from './Advanced'
import Commands from './Commands'
import General from './General'
import styles from './styles.module.scss'

const PreferencePanel = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { configs, loadConfigs, updateConfigs } = useConfigs()
  const [data, setData] = useState<ConfigsType | null>(configs)
  const [activeTab, setActiveTab] = useState<string | null>('general')
  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { lang } = useI18n()

  const clearDraftSaveTimer = () => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current)
      draftSaveTimerRef.current = null
    }
  }

  const resetDraftSaveStatus = () => {
    clearDraftSaveTimer()
    setDraftSaveStatus('idle')
  }

  const onClose = () => {
    setIsOpen(false)
    setData(configs)
    resetDraftSaveStatus()
  }

  const onUpdate = (kv: Partial<ConfigsType>) => {
    setData((prev) => (prev ? { ...prev, ...kv } : prev))
    resetDraftSaveStatus()
  }

  const onTabChange = (value: string | null) => {
    setActiveTab(value)
    resetDraftSaveStatus()
  }

  const onSaveImmediate = async (kv: Partial<ConfigsType>) => {
    setData((prev) => (prev ? { ...prev, ...kv } : prev))
    try {
      await updateConfigs(kv)
    } catch {
      try {
        setData(await loadConfigs())
      } catch (e) {
        console.error('loadConfigs failed after immediate save failure', e)
        if (configs) setData(configs)
      }
      return
    }
    agent.broadcast(events.config_updated, kv)
  }

  const onSaveDraft = async () => {
    if (!data) return
    const patch: Partial<ConfigsType> =
      activeTab === 'commands'
        ? { cmd_after_hosts_apply: data.cmd_after_hosts_apply }
        : activeTab === 'proxy'
          ? {
              use_proxy: data.use_proxy,
              proxy_protocol: data.proxy_protocol,
              proxy_host: data.proxy_host,
              proxy_port: data.proxy_port,
            }
          : {}

    if (Object.keys(patch).length === 0) return

    clearDraftSaveTimer()
    setDraftSaveStatus('saving')
    try {
      await updateConfigs(patch)
    } catch {
      // Keep the drawer open so the user can correct or retry; sync the
      // local Commands/Proxy draft back to whatever the backend really
      // accepted (useConfigs already reset the atom).
      try {
        setData(await loadConfigs())
      } catch (e) {
        console.error('loadConfigs failed after onSave failure', e)
        if (configs) setData(configs)
      }
      setDraftSaveStatus('idle')
      return
    }

    agent.broadcast(events.config_updated, patch)
    setDraftSaveStatus('saved')
    draftSaveTimerRef.current = setTimeout(() => {
      setDraftSaveStatus('idle')
      draftSaveTimerRef.current = null
    }, 1800)
  }

  useEffect(() => {
    if (data === null && configs !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time draft init when configs first loads; subsequent configs changes from immediate-save must not clobber unsaved Commands/Proxy drafts
      setData(configs)
    }
  }, [configs, data])

  useEffect(() => () => clearDraftSaveTimer(), [])

  useOnBroadcast(
    events.show_preferences,
    async () => {
      setIsOpen(true)
      setData(configs)
    },
    [configs],
  )

  const showFooter = activeTab === 'commands' || activeTab === 'proxy'

  if (!data) {
    return null
  }

  return (
    <SideDrawer
      opened={isOpen}
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
        showFooter ? (
          <Group justify="flex-end" gap="12px">
            <Button
              onClick={onSaveDraft}
              loading={draftSaveStatus === 'saving'}
              color={draftSaveStatus === 'saved' ? 'green' : undefined}
              leftSection={
                draftSaveStatus === 'saved' ? (
                  <IconCheck size={16} stroke={1.8} />
                ) : (
                  <IconDeviceFloppy size={16} stroke={1.8} />
                )
              }
            >
              {draftSaveStatus === 'saved' ? lang.save_success : lang.btn_save}
            </Button>
          </Group>
        ) : null
      }
    >
      <div style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column' }}>
        <Tabs value={activeTab} onChange={onTabChange} className={styles.tabs}>
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
                  <General data={data} onChange={onSaveImmediate} />
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
                  <Advanced data={data} onChange={onSaveImmediate} />
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
