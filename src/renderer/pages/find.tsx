/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import {
  Box,
  Button,
  Checkbox,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  useColorMode,
  VStack,
} from '@chakra-ui/react'
import { agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import React, { useEffect } from 'react'
import { IoSearch } from 'react-icons/io5'
import styles from './find.less'

interface Props {

}

const find = (props: Props) => {
  const { lang, setLocale } = useModel('useI18n')
  const { configs, loadConfigs } = useModel('useConfigs')
  const { colorMode, setColorMode } = useColorMode()

  const init = async () => {
    if (!configs) return

    setLocale(configs.locale)

    let theme = configs.theme
    let cls = document.body.className
    document.body.className = cls.replace(/\btheme-\w+/ig, '')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)
  }

  useEffect(() => {
    if (!configs) return
    init().catch(e => console.error(e))
    console.log(configs.theme)
    if (colorMode !== configs.theme) {
      setColorMode(configs.theme)
    }
  }, [configs])

  useEffect(() => {
    console.log(lang.find_and_replace)
    document.title = lang.find_and_replace
  }, [lang])

  useOnBroadcast('config_updated', loadConfigs)

  return (
    <div className={styles.root}>
      <VStack
        spacing={0}
        h="100%"
      >
        <InputGroup>
          <InputLeftElement
            pointerEvents="none"
            children={<IoSearch color="gray.300"/>}
          />
          <Input
            placeholder="keywords"
            variant="flushed"
          />
        </InputGroup>

        <InputGroup>
          <InputLeftElement
            pointerEvents="none"
            children={<IoSearch color="gray.300"/>}
          />
          <Input
            placeholder="replace to"
            variant="flushed"
          />
        </InputGroup>

        <HStack
          w="100%"
          py={2}
          px={4}
          spacing={4}
          // justifyContent="flex-start"
        >
          <Checkbox>{lang.regexp}</Checkbox>
          <Checkbox>{lang.ignore_case}</Checkbox>
        </HStack>

        <Box
          w="100%"
          flex="1"
          bgColor={configs?.theme === 'dark' ? 'gray.700' : 'gray.100'}
        >
          result
        </Box>

        <HStack
          w="100%"
          py={2}
          px={4}
          spacing={4}
          justifyContent="flex-end"
        >
          <Button
            size="sm"
            variant="outline"
          >{lang.replace_all}</Button>
          <Button
            size="sm"
            variant="solid"
            colorScheme="blue"
          >{lang.replace}</Button>
        </HStack>
      </VStack>
    </div>
  )
}

export default find
