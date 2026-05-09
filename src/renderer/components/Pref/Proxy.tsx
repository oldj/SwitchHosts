/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType, ProtocolType } from '@common/default_configs'
import { Box, Checkbox, Group, NativeSelect, Stack, TextInput } from '@mantine/core'
import DescriptionText from '@renderer/components/DescriptionText'
import useI18n from '@renderer/models/useI18n'
import { useState } from 'react'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

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
          <NativeSelect
            disabled={!isUse}
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
          <Box w={labelWidth}>{lang.host}</Box>
          <TextInput
            style={{ width: '200px' }}
            disabled={!isUse}
            value={data.proxy_host}
            onChange={(e) => onChange({ proxy_host: e.target.value })}
          />
        </Group>
      </Box>

      <Box w="100%">
        <Group gap="8px">
          <Box w={labelWidth}>{lang.port}</Box>
          <TextInput
            style={{ width: '80px' }}
            disabled={!isUse}
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
