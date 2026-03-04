/**
 * Commands.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  Textarea,
  VStack,
} from '@chakra-ui/react'
import CommandsHistory from '@renderer/components/Pref/CommandsHistory'
import { ConfigsType } from '@common/default_configs'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const Commands = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useI18n()
  const [show_history, setShowHistory] = useState(false)

  const toggleShowHistory = () => {
    setShowHistory(!show_history)
  }

  return (
    <VStack gap={4}>
      <Box w="100%">
        <Box>{lang.commands_title}</Box>
        <Box mb={3} opacity={0.7} fontSize="sm">
          {lang.commands_help}
        </Box>
        <Textarea
          minHeight="200px"
          placeholder={'# echo "ok!"'}
          value={data.cmd_after_hosts_apply}
          onChange={(e) => onChange({ cmd_after_hosts_apply: e.target.value })}
        />
      </Box>

      <Box>
        <Button variant="plain" onClick={toggleShowHistory}>
          {show_history ? lang.hide_history : lang.show_history}
        </Button>
      </Box>

      <Box w="100%">
        <CommandsHistory is_show={show_history} />
      </Box>
    </VStack>
  )
}

export default Commands
