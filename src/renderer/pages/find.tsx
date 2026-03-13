/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { HostsType } from '@common/data'
import events from '@common/events'
import { IFindItem, IFindPosition, IFindShowSourceParam } from '@common/types'
import { ActionIcon, Box, Button, Checkbox, Group, Loader, Stack, TextInput } from '@mantine/core'
import ItemIcon from '@renderer/components/ItemIcon'
import { actions, agent } from '@renderer/core/agent'
import { PopupMenu } from '@renderer/core/PopupMenu'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
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
  const [replace_to, setReplaceTo] = useState('')
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
    document.body.className = cls.replace(/\btheme-\w+/gi, '')
    document.body.classList.add(`platform-${agent.platform}`, `theme-${theme}`)
  }

  useEffect(() => {
    if (!configs) return
    init().catch((e) => console.error(e))
  }, [configs])

  useEffect(() => {
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

  const parsePositionShow = (find_items: IFindItem[]) => {
    let positions_show: IFindPositionShow[] = []

    find_items.map((item) => {
      let { item_id, item_title, item_type, positions } = item
      positions.map((p, index) => {
        positions_show.push({
          item_id,
          item_title,
          item_type,
          ...p,
          index,
          is_readonly: item_type !== 'local',
        })
      })
    })

    setFindPositions(positions_show)
  }

  const { run: doFind } = useDebounceFn(
    async (v: string) => {
      if (!v) {
        setFindResult([])
        setFindPositions([])
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

      await actions.findAddHistory({
        value: v,
        is_regexp,
        is_ignore_case,
      })
    },
    { wait: 500 },
  )

  const toShowSource = async (result_item: IFindPositionShow) => {
    await actions.cmdFocusMainWindow()
    agent.broadcast(
      events.show_source,
      lodash.pick<IFindShowSourceParam>(result_item, [
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
    let pos: IFindPositionShow = find_positions[current_result_idx]
    if (!pos) return

    setFindPositions([
      ...find_positions.slice(0, current_result_idx),
      {
        ...pos,
        is_disabled: true,
      },
      ...find_positions.slice(current_result_idx + 1),
    ])

    if (replace_to) {
      actions.findAddReplaceHistory(replace_to).catch((e) => console.error(e))
    }

    let r = find_result.find((i) => i.item_id === pos.item_id)
    if (!r) return
    let splitters = r.splitters
    let sp = splitters[pos.index]
    if (!sp) return
    sp.replace = replace_to

    const content = splitters
      .map((splitter) => `${splitter.before}${splitter.replace ?? splitter.match}${splitter.after}`)
      .join('')
    await actions.setHostsContent(pos.item_id, content)
    agent.broadcast(events.hosts_refreshed_by_id, pos.item_id)

    if (current_result_idx < find_positions.length - 1) {
      setCurrentResultIdx(current_result_idx + 1)
    }
  }

  const replaceAll = async () => {
    for (let item of find_result) {
      let { item_id, item_type, splitters } = item
      if (item_type !== 'local' || splitters.length === 0) continue
      const content = splitters
        .map((splitter) => `${splitter.before}${replace_to}${splitter.after}`)
        .join('')
      await actions.setHostsContent(item_id, content)
      agent.broadcast(events.hosts_refreshed_by_id, item_id)
    }

    setFindPositions(
      find_positions.map((pos) => ({
        ...pos,
        is_disabled: !pos.is_readonly,
      })),
    )

    if (replace_to) {
      actions.findAddReplaceHistory(replace_to).catch((e) => console.error(e))
    }
  }

  const ResultRow = ({ data, index }: { data: IFindPositionShow; index: number }) => {
    const el = useRef<HTMLDivElement>(null)
    const is_selected = current_result_idx === index

    useEffect(() => {
      if (el.current && is_selected && current_result_idx !== last_scroll_result_idx) {
        setlastScrollResultIdx(current_result_idx)
        scrollIntoView(el.current, {
          behavior: 'smooth',
          scrollMode: 'if-needed',
        })
      }
    }, [current_result_idx, is_selected, last_scroll_result_idx])

    return (
      <Box
        className={clsx(
          styles.result_row,
          is_selected && styles.selected,
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
    let history = await actions.findGetHistory()
    if (history.length === 0) return

    let menu = new PopupMenu(
      history.reverse().map((i) => ({
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
    let history = await actions.findGetReplaceHistory()
    if (history.length === 0) return

    let menu = new PopupMenu(
      history.reverse().map((v) => ({
        label: v,
        click() {
          setReplaceTo(v)
        },
      })),
    )

    menu.show()
  }

  let can_replace = true
  if (current_result_idx > -1) {
    let pos = find_positions[current_result_idx]
    if (pos?.is_disabled || pos?.is_readonly) {
      can_replace = false
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
      <Stack gap={0} h="100%">
        <TextInput
          autoFocus={true}
          placeholder="keywords"
          value={keyword}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setKeyword(e.target.value)
          }}
          ref={ipt_kw}
          leftSection={leftSection(showKeywordHistory)}
          leftSectionPointerEvents="all"
          styles={flushedInputStyles}
        />

        <TextInput
          placeholder="replace to"
          value={replace_to}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setReplaceTo(e.target.value)
          }}
          leftSection={leftSection(showReplaceHistory)}
          leftSectionPointerEvents="all"
          styles={flushedInputStyles}
        />

        <Group w="100%" py="8px" px="16px" gap="16px">
          <Checkbox
            checked={is_regexp}
            onChange={(e) => setIsRegExp(e.target.checked)}
            label={lang.regexp}
          />
          <Checkbox
            checked={is_ignore_case}
            onChange={(e) => setIsIgnoreCase(e.target.checked)}
            label={lang.ignore_case}
          />
        </Group>

        <Box w="100%" style={{ borderTop: '1px solid var(--swh-border-color-0)' }}>
          <div className={styles.result_row}>
            <div>{lang.match}</div>
            <div>{lang.title}</div>
            <div>{lang.line}</div>
          </div>
        </Box>

        <Box
          w="100%"
          style={{
            flex: 1,
            overflowY: 'auto',
            backgroundColor: 'var(--swh-editor-read-only-bg)',
          }}
        >
          {find_positions.map((item, idx) => (
            <ResultRow key={`${item.item_id}-${idx}`} data={item} index={idx} />
          ))}
        </Box>

        <Group w="100%" py="8px" px="16px" gap="16px">
          {is_searching ? (
            <Loader size="sm" />
          ) : (
            <span>
              {i18n.trans(find_positions.length > 1 ? 'items_found' : 'item_found', [
                find_positions.length.toLocaleString(),
              ])}
            </span>
          )}
          <Box style={{ flex: 1 }} />
          <Button
            size="sm"
            variant="outline"
            disabled={is_searching || find_positions.length === 0}
            onClick={replaceAll}
          >
            {lang.replace_all}
          </Button>
          <Button
            size="sm"
            variant="filled"
            color="blue"
            disabled={is_searching || find_positions.length === 0 || !can_replace}
            onClick={replaceOne}
          >
            {lang.replace}
          </Button>

          <Group gap={0}>
            <ActionIcon
              aria-label="previous"
              variant="outline"
              size="lg"
              onClick={() => {
                let idx = current_result_idx - 1
                if (idx < 0) idx = 0
                setCurrentResultIdx(idx)
              }}
              disabled={current_result_idx <= 0}
            >
              <IoArrowBackOutline />
            </ActionIcon>
            <ActionIcon
              aria-label="next"
              variant="outline"
              size="lg"
              onClick={() => {
                let idx = current_result_idx + 1
                if (idx > find_positions.length - 1) idx = find_positions.length - 1
                setCurrentResultIdx(idx)
              }}
              disabled={current_result_idx >= find_positions.length - 1}
            >
              <IoArrowForwardOutline />
            </ActionIcon>
          </Group>
        </Group>
      </Stack>
    </div>
  )
}

export default FindPage
