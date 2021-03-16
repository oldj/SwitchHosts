/**
 * History
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { actions } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IHostsHistoryObject } from '@root/common/data'
import React, { useEffect, useState } from 'react'

import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  HStack,
  Box,
  Flex,
  List,
  ListItem,
  Spinner,
  Center,
} from '@chakra-ui/react'
import { BiHistory } from 'react-icons/bi'

interface Props {

}

const HistoryList = (): React.ReactElement => {
  return (
    <Flex>
      <List w="200px">
        <ListItem>item</ListItem>
      </List>
      <Box flex={1} pl={3}>
        content
      </Box>
    </Flex>
  )
}

const Loading = (): React.ReactElement => {
  return (
    <Center h="300px">
      <Spinner
        speed="1s"
        emptyColor="gray.200"
        size="lg"
        mr={3}
      />
      <Box>Loading...</Box>
    </Center>
  )
}

const History = (props: Props) => {
  const [ is_open, setIsOpen ] = useState(false)
  const [ is_loading, setIsLoading ] = useState(true)
  const [ list, setList ] = useState<IHostsHistoryObject[]>([])
  const { lang } = useModel('useI18n')

  const loadData = async () => {
    setIsLoading(true)
    let list = await actions.getHistoryList()
    setList(list)
    setIsLoading(false)
  }

  const onClose = () => {
    setIsOpen(false)
    setList([])
  }

  useEffect(() => {
    loadData()
  }, [])

  useOnBroadcast('show_history', () => {
    setIsOpen(true)
    loadData()
  })

  return (
    <Modal size="full" isOpen={is_open} onClose={onClose}>
      <ModalOverlay/>
      <ModalContent>
        <ModalHeader>
          <HStack>
            <Box mr={1}><BiHistory/></Box>
            <Box>{lang.system_hosts_history}</Box>
          </HStack>
        </ModalHeader>
        <ModalCloseButton/>
        <ModalBody>
          {is_loading ? <Loading/> : <HistoryList/>}
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose}>
            {lang.close}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default History
