/**
 * Proxy.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  VStack,
} from '@chakra-ui/react'
import { ConfigsType, ProtocolType } from '@common/default_configs'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const General = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useI18n()
  const [is_use, setIsUse] = useState(data.use_proxy)

  const label_width = 20

  return (
    <VStack spacing={4}>
      <FormControl>
        <HStack>
          <Checkbox
            isChecked={data.use_proxy}
            onChange={(e) => {
              let is_use = e.target.checked
              setIsUse(is_use)
              onChange({ use_proxy: is_use })
            }}
          >
            {lang.use_proxy}
          </Checkbox>
        </HStack>
      </FormControl>

      <FormControl>
        <HStack>
          <FormLabel w={label_width}>{lang.protocol}</FormLabel>
          <Select
            w="200px"
            isDisabled={!is_use}
            value={data.proxy_protocol}
            onChange={(e) => onChange({ proxy_protocol: e.target.value as ProtocolType })}
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </Select>
        </HStack>
      </FormControl>

      <FormControl>
        <HStack>
          <FormLabel w={label_width}>{lang.host}</FormLabel>
          <Input
            w="200px"
            isDisabled={!is_use}
            value={data.proxy_host}
            onChange={(e) => onChange({ proxy_host: e.target.value })}
          />
        </HStack>
      </FormControl>

      <FormControl>
        <HStack>
          <FormLabel w={label_width}>{lang.port}</FormLabel>
          <NumberInput
            w="80px"
            isDisabled={!is_use}
            value={data.proxy_port || ''}
            onChange={(_, vn) => onChange({ proxy_port: vn })}
          >
            <NumberInputField />
          </NumberInput>
        </HStack>
      </FormControl>
    </VStack>
  )
}

export default General
