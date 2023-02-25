/**
 * CommandsHistory
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { actions } from '@renderer/core/agent'
import { ICommandRunResult } from '@common/data'
import useI18n from '@renderer/models/useI18n'
import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { BiTrash } from 'react-icons/bi'
import { ActionIcon, Alert, Button, Center, Group, Space, Stack } from '@mantine/core'
import { IconCheck, IconX } from '@tabler/icons-react'

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
    <Stack w="100%">
      {list.map((item, idx) => {
        return (
          <Alert
            key={idx}
            // status={item.success ? 'success' : 'error'}
            color={item.success ? 'green' : 'red'}
            // w="100%"
            // alignItems="top"
            icon={item.success ? <IconCheck /> : <IconX />}
            title={
              <Group>
                <span>#{item._id}</span>
                <span style={{ fontWeight: 'normal' }}>
                  {dayjs(item.add_time_ms).format('YYYY-MM-DD HH:mm:ss')}
                </span>
                <Space />
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={() => item._id && deleteOneRecord(item._id)}
                >
                  <BiTrash />
                </ActionIcon>
              </Group>
            }
          >
            <Stack>
              {item.stdout ? (
                <>
                  <div>
                    <strong>stdout:</strong>
                  </div>
                  <div>
                    <pre>{item.stdout}</pre>
                  </div>
                </>
              ) : null}
              {item.stderr ? (
                <>
                  <div>
                    <strong>stderr:</strong>
                  </div>
                  <div>
                    <pre>{item.stderr}</pre>
                  </div>
                </>
              ) : null}
            </Stack>
          </Alert>
        )
      })}

      <Group>
        <Button onClick={clearAll} variant="subtle">
          {lang.clear_history}
        </Button>
      </Group>
    </Stack>
  )
}

export default CommandsHistory
