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
  DrawerOverlay, HStack,
  Input,
  Tabs, TabList, TabPanels, Tab, TabPanel,
} from '@chakra-ui/react'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import React, { useState } from 'react'
import { BiEdit, BiSliderAlt } from 'react-icons/bi'

interface Props {

}

const PreferencePanel = (props: Props) => {
  const [ is_open, setIsOpen ] = useState(true)
  const { lang } = useModel('useI18n')

  const onClose = async () => {
    setIsOpen(false)
  }

  useOnBroadcast('show_preferences', () => setIsOpen(true))

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
                <p>one!</p>
              </TabPanel>
              <TabPanel>
                <p>two!</p>
              </TabPanel>
              <TabPanel>
                <p>three!</p>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </DrawerBody>

        <DrawerFooter>
          <Button variant="outline" onClick={onClose} mr={3}>
            {lang.btn_cancel}
          </Button>
          <Button onClick={onClose} colorScheme="blue">
            {lang.btn_ok}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export default PreferencePanel
