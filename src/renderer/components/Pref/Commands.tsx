/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType } from '@common/default_configs'
import { Box, Button, Stack, Textarea } from '@mantine/core'
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
  const [show_history, setShowHistory] = useState(false)

  const toggleShowHistory = () => {
    setShowHistory(!show_history)
  }

  return (
    <Stack gap="16px">
      <Box w="100%">
        <Box>{lang.commands_title}</Box>
        <Box style={{ marginBottom: 12, opacity: 0.7, fontSize: 12 }}>{lang.commands_help}</Box>
        <Textarea
          rows={6}
          placeholder={'# echo "ok!"'}
          value={data.cmd_after_hosts_apply}
          onChange={(e) => onChange({ cmd_after_hosts_apply: e.target.value })}
        />
      </Box>

      <Box>
        <Button variant="light" onClick={toggleShowHistory}>
          {show_history ? lang.hide_history : lang.show_history}
        </Button>
      </Box>

      <Box w="100%">
        <CommandsHistory is_show={show_history} />
      </Box>
    </Stack>
  )
}

export default Commands
