/**
 * CommandsHistory
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
} from '@chakra-ui/react'
import { actions } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { ICommandRunResult } from '@root/common/data'
import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'

interface Props {
  is_show: boolean;
}

const CommandsHistory = (props: Props) => {
  const { is_show } = props
  const [ list, setList ] = useState<ICommandRunResult[]>([])
  const { lang } = useModel('useI18n')

  const loadData = async () => {
    let data = await actions.cmdGetHistoryList()
    setList(data)
  }

  useEffect(() => {
    if (is_show) {
      loadData()
    }
  }, [ is_show ])

  return (
    <Box>
      {list.map((item, idx) => {
        return (
          <Box key={idx}>
            <Box>{dayjs(item.add_time_ms).format('YYYY-MM-DD HH:mm:ss')}</Box>
            <Box>{item.success}</Box>
            <Box>{item.stdout}</Box>
            <Box>{item.stderr}</Box>
          </Box>
        )
      })}
    </Box>
  )
}

export default CommandsHistory
