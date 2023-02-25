/**
 * Commands.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import CommandsHistory from '@renderer/components/Pref/CommandsHistory'
import { ConfigsType } from '@common/default_configs'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'
import { Button, Stack, Textarea } from '@mantine/core'

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
    <Stack spacing={'lg'}>
      <div>{lang.commands_help}</div>
      <Textarea
        label={lang.commands_title}
        minRows={6}
        placeholder={'# echo "ok!"'}
        value={data.cmd_after_hosts_apply}
        onChange={(e) => onChange({ cmd_after_hosts_apply: e.target.value })}
      />

      <Button variant="subtle" onClick={toggleShowHistory}>
        {show_history ? lang.hide_history : lang.show_history}
      </Button>

      <CommandsHistory is_show={show_history} />
    </Stack>
  )
}

export default Commands
