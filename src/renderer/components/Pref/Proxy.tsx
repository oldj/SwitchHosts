/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType, ProtocolType } from '@common/default_configs'
import { Box, Checkbox, Group, Select, Stack, TextInput } from '@mantine/core'
import DescriptionText from '@renderer/components/DescriptionText'
import useI18n from '@renderer/models/useI18n'
import { useState } from 'react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const MAX_PROXY_HOST_LENGTH = 253
const MAX_PROXY_PORT_LENGTH = 5
const MAX_PROXY_PORT = 65535

const General = (props: IProps) => {
  const { data, onChange } = props
  const { lang } = useI18n()
  const [isUse, setIsUse] = useState(data.use_proxy)

  const labelWidth = 80

  return (
    <Stack gap="16px">
      <Box w="100%">
        <Group gap="8px">
          <Checkbox
            checked={data.use_proxy}
            onChange={(e) => {
              const isUse = e.target.checked
              setIsUse(isUse)
              onChange({ use_proxy: isUse })
            }}
            label={lang.use_proxy}
          />
        </Group>
        <DescriptionText mt="8px">{lang.use_proxy_desc}</DescriptionText>
      </Box>

      <Box w="100%">
        <Group gap="8px">
          <Box w={labelWidth}>{lang.protocol}</Box>
          <Select
            disabled={!isUse}
            value={data.proxy_protocol}
            onChange={(v) => v && onChange({ proxy_protocol: v as ProtocolType })}
            data={[
              { value: 'http', label: 'HTTP' },
              { value: 'https', label: 'HTTPS' },
              { value: 'socks5', label: 'SOCKS5' },
            ]}
            w={200}
            allowDeselect={false}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group gap="8px">
          <Box w={labelWidth}>{lang.host}</Box>
          <TextInput
            aria-label={lang.host}
            style={{ width: '200px' }}
            disabled={!isUse}
            value={data.proxy_host}
            maxLength={MAX_PROXY_HOST_LENGTH}
            onChange={(e) => {
              onChange({ proxy_host: e.target.value.slice(0, MAX_PROXY_HOST_LENGTH) })
            }}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group gap="8px">
          <Box w={labelWidth}>{lang.port}</Box>
          <TextInput
            aria-label={lang.port}
            style={{ width: '80px' }}
            disabled={!isUse}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={MAX_PROXY_PORT_LENGTH}
            value={data.proxy_port ? String(data.proxy_port) : ''}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_PROXY_PORT_LENGTH)
              const port = digits ? Math.min(parseInt(digits, 10), MAX_PROXY_PORT) : 0
              onChange({ proxy_port: port })
            }}
          />
        </Group>
      </Box>
    </Stack>
  )
}

export default General
