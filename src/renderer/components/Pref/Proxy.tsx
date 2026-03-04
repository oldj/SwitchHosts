/**
 * Proxy.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Checkbox,
  Box,
  HStack,
  Input,
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
    <VStack gap={4}>
      <Box w="100%">
        <HStack>
          <Checkbox.Root
            checked={data.use_proxy}
          >
            <Checkbox.HiddenInput
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                let is_use = e.target.checked
                setIsUse(is_use)
                onChange({ use_proxy: is_use })
              }}
            />
            <Checkbox.Control />
            <span>{lang.use_proxy}</span>
          </Checkbox.Root>
        </HStack>
      </Box>

      <Box w="100%">
        <HStack>
          <Box w={label_width}>{lang.protocol}</Box>
          <select
            disabled={!is_use}
            value={data.proxy_protocol}
            onChange={(e) => onChange({ proxy_protocol: e.target.value as ProtocolType })}
            style={{ width: '200px', padding: '6px 10px' }}
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </select>
        </HStack>
      </Box>

      <Box w="100%">
        <HStack>
          <Box w={label_width}>{lang.host}</Box>
          <Input
            w="200px"
            disabled={!is_use}
            value={data.proxy_host}
            onChange={(e) => onChange({ proxy_host: e.target.value })}
          />
        </HStack>
      </Box>

      <Box w="100%">
        <HStack>
          <Box w={label_width}>{lang.port}</Box>
          <Input
            w="80px"
            disabled={!is_use}
            type="number"
            value={data.proxy_port || ''}
            onChange={(e) => onChange({ proxy_port: parseInt(e.target.value) || 0 })}
          />
        </HStack>
      </Box>
    </VStack>
  )
}

export default General
