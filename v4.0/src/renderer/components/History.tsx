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
import dayjs from 'dayjs'

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

interface IHistoryProps {
  list: IHostsHistoryObject[];
}

const HistoryList = (props: IHistoryProps): React.ReactElement => {
  const { list } = props
  const [ selected_item, setSelectedItem ] = useState<IHostsHistoryObject>(list[0])

  return (
    <Flex h="80vh" minHeight="300px">
      <Box flex={1} mr={3}>
        {selected_item ? selected_item.content : ''}
      </Box>
      <List w="200px" spacing={3}>
        {list.map((item) => (
          <ListItem key={item.id} onClick={() => setSelectedItem(item)}>
            <span>{dayjs(item.add_time_ms).format('YYYY-MM-DD HH:mm:ss')}</span>
          </ListItem>
        ))}
      </List>
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

const History = () => {
  const [ is_open, setIsOpen ] = useState(true)
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
          {is_loading ? <Loading/> : <HistoryList list={list}/>}
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
