/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  Drawer,
  HStack,
  Tabs,
  Portal,
} from '@chakra-ui/react'
import Proxy from '@renderer/components/Pref/Proxy'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { ConfigsType } from '@common/default_configs'
import events from '@common/events'
import useConfigs from '@renderer/models/useConfigs'
import useI18n from '@renderer/models/useI18n'
import React, { useEffect, useState } from 'react'
import Advanced from './Advanced'
import Commands from './Commands'
import General from './General'
import styles from './styles.module.scss'
import { IconAdjustments } from '@tabler/icons-react'

const PreferencePanel = () => {
  const [is_open, setIsOpen] = useState(false)
  const { configs, updateConfigs } = useConfigs()
  const [data, setData] = useState<ConfigsType | null>(configs)
  const { lang } = useI18n()
  const DrawerPositioner = Drawer.Positioner as unknown as React.FC<React.PropsWithChildren>
  const DrawerContent = Drawer.Content as unknown as React.FC<React.PropsWithChildren>
  const TabsList = Tabs.List as unknown as React.FC<React.PropsWithChildren>
  const TabsTrigger = Tabs.Trigger as unknown as React.FC<React.PropsWithChildren<{ value: string }>>
  const TabsContent = Tabs.Content as unknown as React.FC<React.PropsWithChildren<{ value: string }>>

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
    <Drawer.Root
      size="lg"
      open={is_open}
      placement="end"
      onOpenChange={(e: { open: boolean }) => setIsOpen(e.open)}
    >
      <Portal>
        <Drawer.Backdrop />
        <DrawerPositioner>
          <DrawerContent>
            <Drawer.Header>
          <HStack>
            <Box mr={1}>
              <IconAdjustments size={16} />
            </Box>
            <Box>{lang.preferences}</Box>
          </HStack>
            </Drawer.Header>

            <Drawer.Body>
              <Tabs.Root className={styles.tabs} defaultValue="general">
                <TabsList>
                  <TabsTrigger value="general">{lang.general}</TabsTrigger>
                  <TabsTrigger value="commands">{lang.commands}</TabsTrigger>
                  <TabsTrigger value="proxy">{lang.proxy}</TabsTrigger>
                  <TabsTrigger value="advanced">{lang.advanced}</TabsTrigger>
                </TabsList>

                <Box className={styles.tab_panels}>
                  <TabsContent value="general">
                    <General data={data} onChange={onUpdate} />
                  </TabsContent>
                  <TabsContent value="commands">
                    <Commands data={data} onChange={onUpdate} />
                  </TabsContent>
                  <TabsContent value="proxy">
                    <Proxy data={data} onChange={onUpdate} />
                  </TabsContent>
                  <TabsContent value="advanced">
                    <Advanced data={data} onChange={onUpdate} />
                  </TabsContent>
                </Box>
              </Tabs.Root>
            </Drawer.Body>

            <Drawer.Footer>
              <Button variant="outline" onClick={onClose} mr={3}>
                {lang.btn_cancel}
              </Button>
              <Button onClick={onSave} colorPalette="blue">
                {lang.btn_ok}
              </Button>
            </Drawer.Footer>
          </DrawerContent>
        </DrawerPositioner>
      </Portal>
    </Drawer.Root>
  )
}

export default PreferencePanel
