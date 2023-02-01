/**
 * Commands.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
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
    <VStack spacing={4}>
      <FormControl>
        <FormLabel>{lang.commands_title}</FormLabel>
        <FormHelperText mb={3}>{lang.commands_help}</FormHelperText>
        <Textarea
          minHeight="200px"
          placeholder={'# echo "ok!"'}
          value={data.cmd_after_hosts_apply}
          onChange={(e) => onChange({ cmd_after_hosts_apply: e.target.value })}
        />
      </FormControl>

      <Box>
        <Button variant="link" onClick={toggleShowHistory}>
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
