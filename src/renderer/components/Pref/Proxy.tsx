/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType, ProtocolType } from '@common/default_configs'
import { Box, Checkbox, Group, NativeSelect, Stack, TextInput } from '@mantine/core'
import useI18n from '@renderer/models/useI18n'
import { useState } from 'react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const General = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useI18n()
  const [is_use, setIsUse] = useState(data.use_proxy)

  const label_width = 80

  return (
    <Stack gap="16px">
      <Box w="100%">
        <Group gap="8px">
          <Checkbox
            checked={data.use_proxy}
            onChange={(e) => {
              let is_use = e.target.checked
              setIsUse(is_use)
              onChange({ use_proxy: is_use })
            }}
            label={lang.use_proxy}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group gap="8px">
          <Box w={label_width}>{lang.protocol}</Box>
          <NativeSelect
            disabled={!is_use}
            value={data.proxy_protocol}
            onChange={(e) => onChange({ proxy_protocol: e.target.value as ProtocolType })}
            data={[
              { value: 'http', label: 'HTTP' },
              { value: 'https', label: 'HTTPS' },
            ]}
            w={200}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group gap="8px">
          <Box w={label_width}>{lang.host}</Box>
          <TextInput
            style={{ width: '200px' }}
            disabled={!is_use}
            value={data.proxy_host}
            onChange={(e) => onChange({ proxy_host: e.target.value })}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group gap="8px">
          <Box w={label_width}>{lang.port}</Box>
          <TextInput
            style={{ width: '80px' }}
            disabled={!is_use}
            type="number"
            value={data.proxy_port || ''}
            onChange={(e) => onChange({ proxy_port: parseInt(e.target.value) || 0 })}
          />
        </Group>
      </Box>
    </Stack>
  )
}

export default General
