/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import {
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Spacer,
  Spinner,
  useColorMode,
  VStack,
} from '@chakra-ui/react'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import { HostsType } from '@root/common/data'
import { IFindItem, IFindPosition, IFindShowSourceParam } from '@root/common/types'
import { useDebounce } from 'ahooks'
import clsx from 'clsx'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import { IoArrowBackOutline, IoArrowForwardOutline, IoSearch } from 'react-icons/io5'
import AutoSizer from 'react-virtualized-auto-sizer'
import { FixedSizeList as List, ListChildComponentProps } from 'react-window'
import scrollIntoView from 'smooth-scroll-into-view-if-needed'
import styles from './find.less'

interface Props {

}

interface IFindPositionShow extends IFindPosition {
  item_id: string;
  item_title: string;
  item_type: HostsType;
}

const find = (props: Props) => {
  const { lang, i18n, setLocale } = useModel('useI18n')
  const { configs, loadConfigs } = useModel('useConfigs')
  const { colorMode, setColorMode } = useColorMode()
  const [keyword, setKeyword] = useState('')
  const [replact_to, setReplaceTo] = useState('')
  const [is_regexp, setIsRegExp] = useState(false)
  const [is_ignore_case, setIsIgnoreCase] = useState(false)
  const [find_result, setFindResult] = useState<IFindItem[]>([])
  const [find_positions, setFindPositions] = useState<IFindPositionShow[]>([])
  const [is_searching, setIsSearching] = useState(false)
  const [current_result_idx, setCurrentResultIdx] = useState(0)
  const [last_scroll_result_idx, setlastScrollResultIdx] = useState(-1)
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

  const parsePositionShow = (find_items: IFindItem[]) => {
    let positions_show: IFindPositionShow[] = []

    find_items.map((item) => {
      let { item_id, item_title, item_type, positions } = item
      positions.map((p) => {
        positions_show.push({
          item_id, item_title, item_type,
          ...p,
        })
      })
    })

    console.log(positions_show)
    setFindPositions(positions_show)
  }

  const doFind = lodash.debounce(async (v: string) => {
    console.log('find by:', v)
    if (!v) {
      setFindResult([])
      return
    }

    setIsSearching(true)
    let result = await actions.findBy(v, {
      is_regexp,
      is_ignore_case,
    })
    setCurrentResultIdx(0)
    setlastScrollResultIdx(0)
    setFindResult(result)
    parsePositionShow(result)
    setIsSearching(false)
  }, 500)

  const toShowSource = async (result_item: IFindPositionShow) => {
    // console.log(result_item)
    await actions.cmdFocusMainWindow()
    agent.broadcast('show_source', lodash.pick<IFindShowSourceParam>(result_item, [
      'item_id', 'start', 'end', 'match',
      'line', 'line_pos', 'end_line', 'end_line_pos',
    ]))
  }

  const replaceOne = async (result_item: IFindPositionShow) => {
    await actions.cmdFocusMainWindow()
    agent.broadcast('replace_one', lodash.pick<IFindShowSourceParam>(result_item, [
      'item_id', 'start', 'end', 'match',
      'line', 'line_pos', 'end_line', 'end_line_pos',
    ]))
  }

  const ResultRow = (row_data: ListChildComponentProps) => {
    const data = find_positions[row_data.index]
    const el = useRef<HTMLDivElement>(null)
    const is_selected = current_result_idx === row_data.index

    useEffect(() => {
      if (el.current && is_selected && current_result_idx !== last_scroll_result_idx) {
        setlastScrollResultIdx(current_result_idx)
        scrollIntoView(el.current, {
          behavior: 'smooth',
          scrollMode: 'if-needed',
        })
      }
    }, [el, current_result_idx, last_scroll_result_idx])

    return (
      <Box
        style={row_data.style}
        className={clsx(styles.result_row, is_selected && styles.selected)}
        borderBottomWidth={1}
        borderBottomColor={configs?.theme === 'dark' ? 'gray.600' : 'gray.200'}
        onClick={() => setCurrentResultIdx(row_data.index)}
        onDoubleClick={() => toShowSource(data)}
        ref={el}
        title={lang.to_show_source}
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
                itemCount={find_positions.length}
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
          {is_searching ? (
            <Spinner/>
          ) : (
            <span>{i18n.trans(
              find_positions.length > 1 ? 'items_found' : 'item_found',
              [find_positions.length.toLocaleString()],
            )}</span>
          )}
          <Spacer/>
          <Button
            size="sm"
            variant="outline"
            isDisabled={is_searching || find_positions.length === 0}
          >{lang.replace_all}</Button>
          <Button
            size="sm"
            variant="solid"
            colorScheme="blue"
            isDisabled={is_searching || find_positions.length === 0}
          >{lang.replace}</Button>

          <ButtonGroup
            size="sm"
            isAttached variant="outline"
            isDisabled={is_searching || find_positions.length === 0}
          >
            <IconButton
              aria-label="previous" icon={<IoArrowBackOutline/>}
              onClick={() => {
                let idx = current_result_idx - 1
                if (idx < 0) idx = 0
                setCurrentResultIdx(idx)
              }}
              isDisabled={current_result_idx <= 1}
            />
            <IconButton
              aria-label="next" icon={<IoArrowForwardOutline/>}
              onClick={() => {
                let idx = current_result_idx + 1
                if (idx > find_positions.length) idx = find_positions.length
                setCurrentResultIdx(idx)
              }}
              isDisabled={current_result_idx >= find_positions.length}
            />
          </ButtonGroup>
        </HStack>
      </VStack>
    </div>
  )
}

export default find
