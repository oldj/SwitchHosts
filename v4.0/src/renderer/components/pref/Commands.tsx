/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { FormControl, FormHelperText, FormLabel, Textarea, VStack } from '@chakra-ui/react'
import { ConfigsType } from '@root/common/default_configs'
import React from 'react'

interface IProps {
  data: ConfigsType;
  onChange: (kv: Partial<ConfigsType>) => void;
}

const Commands = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useModel('useI18n')

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
    </VStack>
  )
}

export default Commands
