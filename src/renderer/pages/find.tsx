/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsType } from '@common/data'
import events from '@common/events'
import { IFindItem, IFindPosition, IFindShowSourceParam } from '@common/types'
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  ScrollArea,
  Stack,
  TextInput,
} from '@mantine/core'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useResolvedTheme from '@renderer/models/useResolvedTheme'
import { applyThemeToBody } from '@renderer/utils/theme'
import { useDebounce, useDebounceFn } from 'ahooks'
import clsx from 'clsx'
import lodash from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import {
  IoArrowBackOutline,
  IoArrowForwardOutline,
  IoChevronDownOutline,
  IoSearch,
} from 'react-icons/io5'
import scrollIntoView from 'smooth-scroll-into-view-if-needed'
import useConfigs from '../models/useConfigs'
import useI18n from '../models/useI18n'
import styles from './find.module.scss'

interface IFindPositionShow extends IFindPosition {
  item_id: string
  item_title: string
  item_type: HostsType
  index: number
  is_disabled?: boolean
  is_readonly?: boolean
}

const flushedInputStyles = {
  input: {
    borderTop: 0,
    borderLeft: 0,
    borderRight: 0,
    borderRadius: 0,
    borderBottom: '1px solid var(--swh-border-color-0)',
    backgroundColor: 'transparent',
    paddingLeft: 52,
    paddingRight: 12,
    '&:focus': {
      borderBottomColor: 'var(--swh-primary-color)',
    },
  },
  section: {
    width: 52,
    color: 'var(--swh-font-color-weak)',
  },
} as const

const FindPage = () => {
  const { lang, i18n, setLocale } = useI18n()
  const { configs, loadConfigs } = useConfigs()
  const [keyword, setKeyword] = useState('')
  const [replaceTo, setReplaceTo] = useState('')
  const [isRegExp, setIsRegExp] = useState(false)
  const [isIgnoreCase, setIsIgnoreCase] = useState(false)
  const [findResult, setFindResult] = useState<IFindItem[]>([])
  const [findPositions, setFindPositions] = useState<IFindPositionShow[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [currentResultIdx, setCurrentResultIdx] = useState(0)
  const [lastScrollResultIdx, setlastScrollResultIdx] = useState(-1)
  const debouncedKeyword = useDebounce(keyword, { wait: 500 })
  const iptKw = useRef<HTMLInputElement>(null)
  const resolvedTheme = useResolvedTheme(configs?.theme)

  const init = async () => {
    if (!configs) return

    setLocale(configs.locale)
  }

  const parsePositionShow = (findItems: IFindItem[]) => {
    const positionsShow: IFindPositionShow[] = []

    findItems.map((item) => {
      const { item_id: itemId, item_title: itemTitle, item_type: itemType, positions } = item
      positions.map((p, index) => {
        positionsShow.push({
          item_id: itemId,
          item_title: itemTitle,
          item_type: itemType,
          ...p,
          index,
          is_readonly: itemType !== 'local',
        })
      })
    })

    setFindPositions(positionsShow)
  }

  const { run: doFind } = useDebounceFn(
    async (v: string) => {
      if (!v) {
        setFindResult([])
        setFindPositions([])
        return
      }

      setIsSearching(true)
      const result = await actions.findBy(v, {
        is_regexp: isRegExp,
        is_ignore_case: isIgnoreCase,
      })
      setCurrentResultIdx(0)
      setlastScrollResultIdx(0)
      setFindResult(result)
      parsePositionShow(result)
      setIsSearching(false)

      await actions.findAddHistory({
        value: v,
        is_regexp: isRegExp,
        is_ignore_case: isIgnoreCase,
      })
    },
    { wait: 500 },
  )

  useEffect(() => {
    if (!configs) return
    init().catch((e) => console.error(e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs])

  useEffect(() => {
    if (!configs) return

    applyThemeToBody(resolvedTheme, [`platform-${agent.platform}`])
  }, [configs, resolvedTheme])

  useEffect(() => {
    document.title = lang.find_and_replace
  }, [lang])

  useEffect(() => {
    doFind(debouncedKeyword)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, isRegExp, isIgnoreCase])

  useEffect(() => {
    const onFocus = () => {
      if (iptKw.current) {
        iptKw.current.focus()
      }
    }

    window.addEventListener('focus', onFocus, false)
    return () => window.removeEventListener('focus', onFocus, false)
  }, [])

  useOnBroadcast(events.config_updated, loadConfigs)

  useOnBroadcast(events.close_find, () => {
    setFindResult([])
    setFindPositions([])
    setKeyword('')
    setReplaceTo('')
    setIsRegExp(false)
    setIsIgnoreCase(false)
    setCurrentResultIdx(-1)
    setlastScrollResultIdx(-1)
  })

  const toShowSource = async (resultItem: IFindPositionShow) => {
    await actions.cmdFocusMainWindow()
    agent.broadcast(
      events.show_source,
      lodash.pick<IFindShowSourceParam>(resultItem, [
        'item_id',
        'start',
        'end',
        'match',
        'line',
        'line_pos',
        'end_line',
        'end_line_pos',
      ]),
    )
  }

  const replaceOne = async () => {
    const pos: IFindPositionShow = findPositions[currentResultIdx]
    if (!pos) return

    setFindPositions([
      ...findPositions.slice(0, currentResultIdx),
      {
        ...pos,
        is_disabled: true,
      },
      ...findPositions.slice(currentResultIdx + 1),
    ])

    if (replaceTo) {
      actions.findAddReplaceHistory(replaceTo).catch((e) => console.error(e))
    }

    const r = findResult.find((i) => i.item_id === pos.item_id)
    if (!r) return
    const splitters = r.splitters
    const sp = splitters[pos.index]
    if (!sp) return
    sp.replace = replaceTo

    const content = splitters
      .map((splitter) => `${splitter.before}${splitter.replace ?? splitter.match}${splitter.after}`)
      .join('')
    await actions.setHostsContent(pos.item_id, content)
    agent.broadcast(events.hosts_refreshed_by_id, pos.item_id)

    if (currentResultIdx < findPositions.length - 1) {
      setCurrentResultIdx(currentResultIdx + 1)
    }
  }

  const replaceAll = async () => {
    for (const item of findResult) {
      const { item_id: itemId, item_type: itemType, splitters } = item
      if (itemType !== 'local' || splitters.length === 0) continue
      const content = splitters
        .map((splitter) => `${splitter.before}${replaceTo}${splitter.after}`)
        .join('')
      await actions.setHostsContent(itemId, content)
      agent.broadcast(events.hosts_refreshed_by_id, itemId)
    }

    setFindPositions(
      findPositions.map((pos) => ({
        ...pos,
        is_disabled: !pos.is_readonly,
      })),
    )

    if (replaceTo) {
      actions.findAddReplaceHistory(replaceTo).catch((e) => console.error(e))
    }
  }

  const ResultRow = ({ data, index }: { data: IFindPositionShow; index: number }) => {
    const el = useRef<HTMLDivElement>(null)
    const isSelected = currentResultIdx === index

    useEffect(() => {
      if (el.current && isSelected && currentResultIdx !== lastScrollResultIdx) {
        setlastScrollResultIdx(currentResultIdx)
        scrollIntoView(el.current, {
          behavior: 'smooth',
          scrollMode: 'if-needed',
        })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentResultIdx, isSelected, lastScrollResultIdx])

    return (
      <Box
        className={clsx(
          styles.result_row,
          isSelected && styles.selected,
          data.is_disabled && styles.disabled,
          data.is_readonly && styles.readonly,
        )}
        onClick={() => {
          setCurrentResultIdx(index)
        }}
        onDoubleClick={() => toShowSource(data)}
        ref={el}
        title={lang.to_show_source}
      >
        <div className={styles.result_content}>
          {data.is_readonly ? <span className={styles.read_only}>{lang.read_only}</span> : null}
          <span>{data.before}</span>
          <span className={styles.highlight}>{data.match}</span>
          <span>{data.after}</span>
        </div>
        <div className={styles.result_title}>
          <ItemIcon type={data.item_type} />
          <span>{data.item_title}</span>
        </div>
        <div className={styles.result_line}>{data.line}</div>
      </Box>
    )
  }

  const showKeywordHistory = async () => {
    const history = await actions.findGetHistory()
    if (history.length === 0) return

    const menu = new PopupMenu(
      history.reverse().map((i: { value: string; is_regexp: boolean; is_ignore_case: boolean }) => ({
        label: i.value,
        click() {
          setKeyword(i.value)
          setIsRegExp(i.is_regexp)
          setIsIgnoreCase(i.is_ignore_case)
        },
      })),
    )

    menu.show()
  }

  const showReplaceHistory = async () => {
    const history = await actions.findGetReplaceHistory()
    if (history.length === 0) return

    const menu = new PopupMenu(
      history.reverse().map((v: string) => ({
        label: v,
        click() {
          setReplaceTo(v)
        },
      })),
    )

    menu.show()
  }

  let canReplace = true
  if (currentResultIdx > -1) {
    const pos = findPositions[currentResultIdx]
    if (pos?.is_disabled || pos?.is_readonly) {
      canReplace = false
    }
  }

  const leftSection = (onClick: () => void) => (
    <Group gap={0} wrap="nowrap" onClick={onClick} style={{ cursor: 'pointer' }}>
      <IoSearch />
      <IoChevronDownOutline style={{ fontSize: 10 }} />
    </Group>
  )

  return (
    <div className={styles.root}>
      <Stack gap={0} h="100%" className={styles.layout}>
        <Stack gap={0} className={styles.content}>
          <TextInput
            autoFocus={true}
            placeholder="keywords"
            value={keyword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setKeyword(e.target.value)
            }}
            ref={iptKw}
            leftSection={leftSection(showKeywordHistory)}
            leftSectionPointerEvents="all"
            styles={flushedInputStyles}
          />

          <TextInput
            placeholder="replace to"
            value={replaceTo}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setReplaceTo(e.target.value)
            }}
            leftSection={leftSection(showReplaceHistory)}
            leftSectionPointerEvents="all"
            styles={flushedInputStyles}
          />

          <Group w="100%" py="8px" px="16px" gap="16px">
            <Checkbox
              checked={isRegExp}
              onChange={(e) => setIsRegExp(e.target.checked)}
              label={lang.regexp}
            />
            <Checkbox
              checked={isIgnoreCase}
              onChange={(e) => setIsIgnoreCase(e.target.checked)}
              label={lang.ignore_case}
            />
          </Group>

          <Box w="100%" className={styles.result_header}>
            <div className={styles.result_row}>
              <div>{lang.match}</div>
              <div>{lang.title}</div>
              <div>{lang.line}</div>
            </div>
          </Box>

          <ScrollArea className={styles.result_list} scrollbars="y" type="hover">
            <div className={styles.result_list_inner}>
              {findPositions.map((item, idx) => (
                <ResultRow key={`${item.item_id}-${idx}`} data={item} index={idx} />
              ))}
            </div>
          </ScrollArea>
        </Stack>

        <Group className={styles.status_bar} w="100%" py="8px" px="16px" gap="16px">
          {isSearching ? (
            <Loader size="sm" />
          ) : (
            <span>
              {i18n.trans(findPositions.length > 1 ? 'items_found' : 'item_found', [
                findPositions.length.toLocaleString(),
              ])}
            </span>
          )}
          <Box style={{ flex: 1 }} />
          <Button
            size="sm"
            variant="outline"
            disabled={isSearching || findPositions.length === 0}
            onClick={replaceAll}
          >
            {lang.replace_all}
          </Button>
          <Button
            size="sm"
            variant="filled"
            disabled={isSearching || findPositions.length === 0 || !canReplace}
            onClick={replaceOne}
          >
            {lang.replace}
          </Button>

          <ActionIcon.Group>
            <ActionIcon
              aria-label="previous"
              variant="outline"
              size="lg"
              onClick={() => {
                let idx = currentResultIdx - 1
                if (idx < 0) idx = 0
                setCurrentResultIdx(idx)
              }}
              disabled={currentResultIdx <= 0}
            >
              <IoArrowBackOutline />
            </ActionIcon>
            <ActionIcon
              aria-label="next"
              variant="outline"
              size="lg"
              onClick={() => {
                let idx = currentResultIdx + 1
                if (idx > findPositions.length - 1) idx = findPositions.length - 1
                setCurrentResultIdx(idx)
              }}
              disabled={currentResultIdx >= findPositions.length - 1}
            >
              <IoArrowForwardOutline />
            </ActionIcon>
          </ActionIcon.Group>
        </Group>
      </Stack>
    </div>
  )
}

export default FindPage
