/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
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
  useColorMode
} from '@chakra-ui/react'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { ConfigsType } from '@root/common/default_configs'
import React, { useEffect, useState } from 'react'
import { BiSliderAlt } from 'react-icons/bi'
import Advanced from './Advanced'
import Commands from './Commands'
import General from './General'

interface Props {

}

const PreferencePanel = (props: Props) => {
  const [is_open, setIsOpen] = useState(false)
  const { configs, updateConfigs } = useModel('useConfigs')
  const [data, setData] = useState<ConfigsType | null>(configs)
  const { lang } = useModel('useI18n')
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

    agent.broadcast('config_updated')
  }

  useEffect(() => {
    setData(configs)
  }, [configs])

  useOnBroadcast('show_preferences', async () => {
    setIsOpen(true)
  })

  if (!data) {
    console.log('invalid config data!')
    return null
  }

  return (
    <Drawer
      size="lg"
      isOpen={is_open}
      placement="right"
      onClose={onClose}
    >
      <DrawerOverlay/>
      <DrawerContent>
        <DrawerHeader>
          <HStack>
            <Box mr={1}><BiSliderAlt/></Box>
            <Box>{lang.preferences}</Box>
          </HStack>
        </DrawerHeader>

        <DrawerBody>
          <Tabs>
            <TabList>
              <Tab>{lang.general}</Tab>
              <Tab>{lang.commands}</Tab>
              <Tab>{lang.advanced}</Tab>
            </TabList>

            <TabPanels>
              <TabPanel>
                <General data={data} onChange={onUpdate}/>
              </TabPanel>
              <TabPanel>
                <Commands data={data} onChange={onUpdate}/>
              </TabPanel>
              <TabPanel>
                <Advanced data={data} onChange={onUpdate}/>
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
