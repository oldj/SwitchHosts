/**
 * CommandsHistory
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Button,
  Center,
  HStack,
  IconButton,
  Spacer,
  VStack,
} from '@chakra-ui/react'
import { actions } from '@renderer/core/agent'
import { ICommandRunResult } from '@common/data'
import useI18n from '@renderer/models/useI18n'
import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { BiTrash } from 'react-icons/bi'

interface Props {
  is_show: boolean
}

const CommandsHistory = (props: Props) => {
  const { is_show } = props
  const [list, setList] = useState<ICommandRunResult[]>([])
  const { lang } = useI18n()

  const loadData = async () => {
    let data = await actions.cmdGetHistoryList()
    data = data.reverse()
    setList(data)
  }

  const deleteOneRecord = async (_id: string) => {
    await actions.cmdDeleteHistory(_id)
    setList(list.filter((i) => i._id !== _id))
  }

  const clearAll = async () => {
    await actions.cmdClearHistory()
    setList([])
  }

  useEffect(() => {
    if (is_show) {
      loadData()
    }
  }, [is_show])

  if (!is_show) {
    return null
  }

  if (list.length === 0) {
    return <Center h="100px">{lang.no_record}</Center>
  }

  return (
    <VStack w="100%">
      {list.map((item, idx) => {
        return (
          <Alert
            key={idx}
            status={item.success ? 'success' : 'error'}
            w="100%"
            // alignItems="top"
          >
            <AlertIcon />
            <Box flex="1">
              <AlertTitle>
                <HStack>
                  <span>#{item._id}</span>
                  <span style={{ fontWeight: 'normal' }}>
                    {dayjs(item.add_time_ms).format('YYYY-MM-DD HH:mm:ss')}
                  </span>
                  <Spacer />
                  <IconButton
                    aria-label="delete"
                    icon={<BiTrash />}
                    size="sm"
                    variant="ghost"
                    onClick={() => item._id && deleteOneRecord(item._id)}
                  />
                </HStack>
              </AlertTitle>
              <AlertDescription>
                {item.stdout ? (
                  <>
                    <Box>
                      <strong>stdout:</strong>
                    </Box>
                    <Box>
                      <pre>{item.stdout}</pre>
                    </Box>
                  </>
                ) : null}
                {item.stderr ? (
                  <>
                    <Box>
                      <strong>stderr:</strong>
                    </Box>
                    <Box>
                      <pre>{item.stderr}</pre>
                    </Box>
                  </>
                ) : null}
              </AlertDescription>
            </Box>
          </Alert>
        )
      })}

      <Box pt={10}>
        <Button onClick={clearAll} variant="link">
          {lang.clear_history}
        </Button>
      </Box>
    </VStack>
  )
}

export default CommandsHistory
