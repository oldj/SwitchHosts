/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import { Box, Button, Stack, Textarea } from '@mantine/core'
import DescriptionText from '@renderer/components/DescriptionText'
import CommandsHistory from '@renderer/components/Pref/CommandsHistory'
import useI18n from '@renderer/models/useI18n'
import { useState } from 'react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const Commands = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useI18n()
  const [showHistory, setShowHistory] = useState(false)

  const toggleShowHistory = () => {
    setShowHistory(!showHistory)
  }

  return (
    <Stack gap="16px">
      <Box w="100%">
        <Box>{lang.commands_title}</Box>
        <DescriptionText mb="12px">{lang.commands_help}</DescriptionText>
        <Textarea
          rows={6}
          placeholder={'# echo "ok!"'}
          value={data.cmd_after_hosts_apply}
          onChange={(e) => onChange({ cmd_after_hosts_apply: e.target.value })}
        />
      </Box>

      <Box>
        <Button variant="light" onClick={toggleShowHistory}>
          {showHistory ? lang.hide_history : lang.show_history}
        </Button>
      </Box>

      <Box w="100%">
        <CommandsHistory isShow={showHistory} />
      </Box>
    </Stack>
  )
}

export default Commands
