/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import {
  FormControl,
  Button,
  Box,
  FormHelperText,
  FormLabel,
  Textarea,
  VStack,
} from '@chakra-ui/react'
import CommandsHistory from '@renderer/components/Pref/CommandsHistory'
import { agent } from '@renderer/core/agent'
import { ConfigsType } from '@root/common/default_configs'
import React, { useState } from 'react'

interface IProps {
  data: ConfigsType;
  onChange: (kv: Partial<ConfigsType>) => void;
}

const Commands = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useModel('useI18n')
  const [ show_history, setShowHistory ] = useState(false)

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
          onChange={e => onChange({ cmd_after_hosts_apply: e.target.value })}
        />
      </FormControl>

      <Box>
        <Button variant="link" onClick={toggleShowHistory}>show history</Button>
      </Box>

      <Box>
        <CommandsHistory is_show={show_history}/>
      </Box>
    </VStack>
  )
}

export default Commands
