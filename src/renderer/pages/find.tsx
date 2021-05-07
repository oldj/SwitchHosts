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
  Spacer,
  Tooltip,
  useColorMode,
  VStack,
} from '@chakra-ui/react'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { IFindResultItem, IFindShowSourceParam } from '@root/common/types'
import { useDebounce } from 'ahooks'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import { IoSearch } from 'react-icons/io5'
import { FixedSizeList as List, ListChildComponentProps } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import styles from './find.less'

interface Props {

}

const find = (props: Props) => {
  const { lang, i18n, setLocale } = useModel('useI18n')
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
  }, 500)

  const toShowSource = async (result_item: IFindResultItem) => {
    console.log(result_item)
    await actions.cmdFocusMainWindow()
    agent.broadcast('show_source', lodash.pick<IFindShowSourceParam>(result_item, [
      'item_id', 'start', 'end', 'match',
      'line', 'line_pos', 'end_line', 'end_line_pos',
    ]))
  }

  const ResultRow = (row_data: ListChildComponentProps) => {
    let data = find_result[row_data.index]
    return (
      <Tooltip label={lang.to_show_source} placement="top" hasArrow>
        <Box
          style={row_data.style}
          className={styles.result_row}
          borderBottomWidth={1}
          borderBottomColor={configs?.theme === 'dark' ? 'gray.600' : 'gray.200'}
          onDoubleClick={e => toShowSource(data)}
        >
          <div className={styles.result_content}>
            <span>{data.before}</span>
            <span className={styles.highlight}>{data.match}</span>
            <span>{data.after}</span>
          </div>
          <div className={styles.result_title}>
            <ItemIcon type={data.item_type}/>
            <span>{data.item_title}</span>
          </div>
          <div className={styles.result_line}>{data.line}</div>
        </Box>
      </Tooltip>
    )
  }

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
          borderTopWidth={1}
        >
          <div className={styles.result_row}>
            <div>{lang.match}</div>
            <div>{lang.title}</div>
            <div>{lang.line}</div>
          </div>
        </Box>

        <Box
          w="100%"
          flex="1"
          bgColor={configs?.theme === 'dark' ? 'gray.700' : 'gray.100'}
        >
          <AutoSizer>
            {({ width, height }) => (
              <List
                width={width}
                height={height}
                itemCount={find_result.length}
                itemSize={28}
              >
                {ResultRow}
              </List>
            )}
          </AutoSizer>
        </Box>

        <HStack
          w="100%"
          py={2}
          px={4}
          spacing={4}
          // justifyContent="flex-end"
        >
          <span>{i18n.trans(find_result.length > 1 ? 'items_found' : 'item_found', [find_result.length.toString()])}</span>
          <Spacer/>
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
