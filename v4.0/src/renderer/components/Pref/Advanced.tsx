/**
 * General
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import { Checkbox, FormControl, FormHelperText, FormLabel, VStack } from '@chakra-ui/react'
import { ConfigsType } from '@root/common/default_configs'
import React from 'react'

interface IProps {
  data: ConfigsType;
  onChange: (kv: Partial<ConfigsType>) => void;
}

const Advanced = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useModel('useI18n')

  return (
    <VStack spacing={4}>
      <FormControl>
        <FormLabel>{lang.usage_data_title}</FormLabel>
        <FormHelperText mb={2}>{lang.usage_data_help}</FormHelperText>
        <Checkbox
          isChecked={data.send_usage_data}
          onChange={e => onChange({ send_usage_data: e.target.checked })}
        >
          {lang.usage_data_agree}
        </Checkbox>
      </FormControl>
    </VStack>
  )
}

export default Advanced
