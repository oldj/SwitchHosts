/**
 * Proxy.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { ConfigsType, ProtocolType } from '@common/default_configs'
import { Checkbox, Group, Input, NumberInput, Select, Stack } from '@mantine/core'
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
    <Stack spacing={'lg'}>
      <Group>
        <Checkbox
          label={lang.use_proxy}
          checked={data.use_proxy}
          onChange={(e) => {
            let is_use = e.target.checked
            setIsUse(is_use)
            onChange({ use_proxy: is_use })
          }}
        />
      </Group>

      <Group>
        <Select
          label={lang.protocol}
          w="200px"
          disabled={!is_use}
          value={data.proxy_protocol}
          data={[
            { label: 'HTTP', value: 'http' },
            { label: 'HTTPS', value: 'https' },
          ]}
          onChange={(v) => onChange({ proxy_protocol: v as ProtocolType })}
        />
      </Group>

      <Group>
        <Input.Wrapper label={lang.host} w={'100%'}>
          <Input
            disabled={!is_use}
            value={data.proxy_host}
            onChange={(e) => onChange({ proxy_host: e.target.value })}
          />
        </Input.Wrapper>
      </Group>

      <Group>
        <NumberInput
          label={lang.port}
          disabled={!is_use}
          value={data.proxy_port || undefined}
          min={0}
          onChange={(vn) => onChange({ proxy_port: vn })}
        />
      </Group>
    </Stack>
  )
}

export default General
