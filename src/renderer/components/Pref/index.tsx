/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  useColorMode,
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
  const { colorMode, setColorMode } = useColorMode()

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

    if (colorMode !== data.theme) {
      setColorMode(data.theme)
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
    <Drawer size="lg" isOpen={is_open} placement="right" onClose={onClose}>
      <DrawerOverlay />
      <DrawerContent>
        <DrawerHeader>
          <HStack>
            <Box mr={1}>
              <IconAdjustments size={16} />
            </Box>
            <Box>{lang.preferences}</Box>
          </HStack>
        </DrawerHeader>

        <DrawerBody>
          <Tabs className={styles.tabs}>
            <TabList>
              <Tab>{lang.general}</Tab>
              <Tab>{lang.commands}</Tab>
              <Tab>{lang.proxy}</Tab>
              <Tab>{lang.advanced}</Tab>
            </TabList>

            <TabPanels className={styles.tab_panels}>
              <TabPanel>
                <General data={data} onChange={onUpdate} />
              </TabPanel>
              <TabPanel>
                <Commands data={data} onChange={onUpdate} />
              </TabPanel>
              <TabPanel>
                <Proxy data={data} onChange={onUpdate} />
              </TabPanel>
              <TabPanel>
                <Advanced data={data} onChange={onUpdate} />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </DrawerBody>

        <DrawerFooter>
          <Button variant="outline" onClick={onClose} mr={3}>
            {lang.btn_cancel}
          </Button>
          <Button onClick={onSave} colorScheme="blue">
            {lang.btn_ok}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export default PreferencePanel
