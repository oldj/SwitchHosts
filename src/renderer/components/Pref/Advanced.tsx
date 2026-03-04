/**
 * Advanced.tsx
 * @author: oldj
 * @homepage: https://oldj.net
 */

import {
  Box,
  Button,
  Checkbox,
  HStack,
  Link,
  Tooltip,
  VStack,
} from '@chakra-ui/react'
import { actions } from '@renderer/core/agent'
import { ConfigsType } from '@common/default_configs'
import useI18n from '@renderer/models/useI18n'
import React, { useEffect, useState } from 'react'
import styles from './styles.module.scss'

interface IProps {
  data: ConfigsType
  onChange: (kv: Partial<ConfigsType>) => void
}

const PathLink = (props: { link: string }) => {
  const { link } = props
  const { lang } = useI18n()
  const isDisabled = !link
  const TooltipTrigger = Tooltip.Trigger as unknown as React.FC<React.PropsWithChildren<{ asChild?: boolean }>>
  const TooltipPositioner = Tooltip.Positioner as unknown as React.FC<React.PropsWithChildren>
  const TooltipContent = Tooltip.Content as unknown as React.FC<React.PropsWithChildren>

  return (
    <Tooltip.Root>
      <TooltipTrigger asChild>
        <Link
          className={styles.link}
          onClick={(e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (isDisabled) return
            actions.showItemInFolder(link)
          }}
          href={isDisabled ? undefined : 'file://' + link}
          opacity={isDisabled ? 0.5 : 1}
          pointerEvents={isDisabled ? 'none' : 'auto'}
        >
          {link}
        </Link>
      </TooltipTrigger>
      <TooltipPositioner>
        <TooltipContent>{lang.click_to_open}</TooltipContent>
      </TooltipPositioner>
    </Tooltip.Root>
  )
}

const Advanced = (props: IProps) => {
  const { data, onChange } = props
  const { i18n, lang } = useI18n()
  const [hosts_path, setHostsPath] = useState('')
  const [data_dir, setDataDir] = useState('')
  const [default_data_dir, setDefaultDataDir] = useState('')

  useEffect(() => {
    actions.getPathOfSystemHosts().then((hosts_path) => setHostsPath(hosts_path))
    actions.getDataDir().then((data_dir) => setDataDir(data_dir))
    actions.getDefaultDataDir().then((default_data_dir) => setDefaultDataDir(default_data_dir))
  }, [])

  return (
    <VStack gap={10}>
      <Box w="100%">
        <Box>{lang.usage_data_title}</Box>
        <Box mb={2} opacity={0.7} fontSize="sm">
          {lang.usage_data_help}
        </Box>
        <Checkbox.Root
          checked={data.send_usage_data}
        >
          <Checkbox.HiddenInput
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onChange({ send_usage_data: e.target.checked })
            }
          />
          <Checkbox.Control />
          <span>{lang.usage_data_agree}</span>
        </Checkbox.Root>
      </Box>

      <Box w="100%">
        <Box>{lang.where_is_my_hosts}</Box>
        <Box mb={2} opacity={0.7} fontSize="sm">
          {lang.your_hosts_file_is}
        </Box>
        <PathLink link={hosts_path} />
      </Box>

      <Box w="100%">
        <Box>{lang.where_is_my_data}</Box>
        <Box mb={2} opacity={0.7} fontSize="sm">
          {lang.your_data_is}
        </Box>
        <HStack>
          <PathLink link={data_dir} />
          <Button
            variant="plain"
            onClick={async () => {
              let r = await actions.cmdChangeDataDir()
              console.log(r)
            }}
          >
            {lang.change}
          </Button>

          {data_dir !== default_data_dir && (
            <Button
              variant="plain"
              onClick={async () => {
                if (!confirm(i18n.trans('reset_data_dir_confirm', [default_data_dir]))) {
                  return
                }
                let r = await actions.cmdChangeDataDir(true)
                console.log(r)
              }}
            >
              {lang.reset}
            </Button>
          )}
        </HStack>
      </Box>
    </VStack>
  )
}

export default Advanced
