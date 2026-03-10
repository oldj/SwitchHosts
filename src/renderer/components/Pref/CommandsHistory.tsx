/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ICommandRunResult } from '@common/data'
import { ActionIcon, Alert, Box, Button, Center, Group, Stack } from '@mantine/core'
import { actions } from '@renderer/core/agent'
import useI18n from '@renderer/models/useI18n'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
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
    <Stack gap="8px">
      {list.map((item, idx) => {
        return (
          <Alert key={idx} color={item.success ? 'green' : 'red'} style={{ width: '100%' }}>
            <div>
              <Group gap="8px">
                <span>#{item._id}</span>
                <span style={{ fontWeight: 'normal' }}>
                  {dayjs(item.add_time_ms).format('YYYY-MM-DD HH:mm:ss')}
                </span>
                <Box style={{ flex: 1 }} />
                <ActionIcon
                  aria-label="delete"
                  size="sm"
                  variant="subtle"
                  onClick={() => item._id && deleteOneRecord(item._id)}
                >
                  <BiTrash />
                </ActionIcon>
              </Group>
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
            </div>
          </Alert>
        )
      })}

      <Box pt="40px">
        <Button onClick={clearAll} variant="subtle">
          {lang.clear_history}
        </Button>
      </Box>
    </Stack>
  )
}

export default CommandsHistory
