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
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IFindResultItem } from '@root/common/types'
import { useDebounce } from 'ahooks'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import { IoSearch } from 'react-icons/io5'
import styles from './find.less'

interface Props {

}

const find = (props: Props) => {
  const { lang, setLocale } = useModel('useI18n')
  const { configs, loadConfigs } = useModel('useConfigs')
  const { colorMode, setColorMode } = useColorMode()
  const [keyword, setKeyword] = useState('')
  const [replact_to, setReplaceTo] = useState('')
  const [is_regexp, setIsRegExp] = useState(false)
  const [is_ignore_case, setIsIgnoreCase] = useState(false)
  const [find_result, setFindResult] = useState<IFindResultItem[]>([])
  const debounced_keyword = useDebounce(keyword, { wait: 500 })
  const ipt_kw = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    doFind(debounced_keyword)
  }, [debounced_keyword, is_regexp, is_ignore_case])

  useEffect(() => {
    const onFocus = () => {
      if (ipt_kw.current) {
        ipt_kw.current.focus()
      }
    }

    window.addEventListener('focus', onFocus, false)
    return () => window.removeEventListener('focus', onFocus, false)
  }, [ipt_kw])

  useOnBroadcast('config_updated', loadConfigs)

  const doFind = lodash.debounce(async (v: string) => {
    console.log('find by:', v)
    if (!v) {
      setFindResult([])
      return
    }

    let result = await actions.findBy(v, {
      is_regexp,
      is_ignore_case,
    })
    setFindResult(result)
    console.log(result)
  }, 500)

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
            autoFocus={true}
            placeholder="keywords"
            variant="flushed"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
            }}
            ref={ipt_kw}
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
            value={replact_to}
            onChange={(e) => {
              setReplaceTo(e.target.value)
            }}
          />
        </InputGroup>

        <HStack
          w="100%"
          py={2}
          px={4}
          spacing={4}
          // justifyContent="flex-start"
        >
          <Checkbox
            checked={is_regexp}
            onChange={(e) => setIsRegExp(e.target.checked)}
          >{lang.regexp}</Checkbox>
          <Checkbox
            checked={is_ignore_case}
            onChange={(e) => setIsIgnoreCase(e.target.checked)}
          >{lang.ignore_case}</Checkbox>
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
            isDisabled={find_result.length === 0}
          >{lang.replace_all}</Button>
          <Button
            size="sm"
            variant="solid"
            colorScheme="blue"
            isDisabled={find_result.length === 0}
          >{lang.replace}</Button>
        </HStack>
      </VStack>
    </div>
  )
}

export default find
