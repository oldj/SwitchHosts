/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import logo from '@/assets/logo@4x.png'
import events from '@common/events'
import { ActionIcon, Badge, Box, Divider, Flex } from '@mantine/core'
import ItemIcon from '@renderer/components/ItemIcon'
import SwitchButton from '@renderer/components/SwitchButton'
import { actions, agent } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconMinus,
  IconPlus,
  IconSquare,
  IconX,
} from '@tabler/icons-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import styles from './index.module.scss'

interface IProps {
  showLeftPanel: boolean
  showRightPanel: boolean
  useSystemWindowFrame: boolean
}

const TopBar = (props: IProps) => {
  const { showLeftPanel, showRightPanel } = props
  const { lang } = useI18n()
  const { isHostsInTrashcan, currentHosts, isReadOnly } = useHostsData()
  const [isOn, setIsOn] = useState(!!currentHosts?.on)
  const iconSize = 20
  const iconStroke = 1.5

  const showToggleSwitch =
    !showLeftPanel && currentHosts && !isHostsInTrashcan(currentHosts.id)
  const showAppBrand = agent.platform !== 'darwin'
  const showWindowControls = agent.platform !== 'darwin'
  const currentTitle = currentHosts ? currentHosts.title || lang.untitled : lang.system_hosts

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror prop into local optimistic state; also set by useOnBroadcast
    setIsOn(!!currentHosts?.on)
  }, [currentHosts])

  useOnBroadcast(
    events.set_hosts_on_status,
    (id: string, on: boolean) => {
      if (currentHosts && currentHosts.id === id) {
        setIsOn(on)
      }
    },
    [currentHosts],
  )

  return (
    <div
      className={clsx(styles.root, showAppBrand && styles.with_app_brand)}
      data-tauri-drag-region
    >
      <div className={styles.left_cluster} data-tauri-drag-region>
        {showAppBrand ? (
          <div
            className={styles.app_brand}
            data-testid="titlebar-brand"
            data-tauri-drag-region
          >
            <span
              className={styles.app_logo_slot}
              data-testid="titlebar-logo-slot"
              data-tauri-drag-region
            >
              <img className={styles.app_logo} src={logo} alt="" data-testid="titlebar-logo" />
            </span>
            <span className={styles.app_title} data-tauri-drag-region>
              {lang._app_name}
            </span>
          </div>
        ) : null}

        <Flex align="center" justify="center" gap={8}>
          <ActionIcon
            aria-label="Toggle sidebar"
            onClick={() => {
              agent.broadcast(events.toggle_left_panel, !showLeftPanel)
            }}
            variant="subtle"
            color="gray"
          >
            {showLeftPanel ? (
              <IconLayoutSidebarLeftCollapse size={iconSize} stroke={iconStroke} />
            ) : (
              <IconLayoutSidebarLeftExpand size={iconSize} stroke={iconStroke} />
            )}
          </ActionIcon>
          <ActionIcon
            aria-label="Add"
            onClick={() => agent.broadcast(events.add_new)}
            variant="subtle"
            color="gray"
          >
            <IconPlus size={iconSize} stroke={iconStroke} />
          </ActionIcon>
        </Flex>
      </div>

      <Box
        className={styles.title_wrapper}
        data-testid="titlebar-current-title"
        data-tauri-drag-region
      >
        <Flex className={styles.title} gap={8} align="center" justify="center">
          {currentHosts ? (
            <>
              <span className={styles.hosts_icon} data-testid="titlebar-current-icon">
                <ItemIcon type={currentHosts.type} isCollapsed={!currentHosts.folder_open} />
              </span>
              <span
                className={styles.hosts_title}
                title={currentTitle}
                data-testid="titlebar-current-title-text"
              >
                {currentTitle}
              </span>
            </>
          ) : (
            <>
              <span className={styles.hosts_icon} data-testid="titlebar-current-icon">
                <ItemIcon type="system" />
              </span>
              <span
                className={styles.hosts_title}
                title={currentTitle}
                data-testid="titlebar-current-title-text"
              >
                {currentTitle}
              </span>
            </>
          )}

          {isReadOnly(currentHosts) ? (
            <Badge
              variant="light"
              color="gray"
              size="sm"
              radius="sm"
              tt="none"
              className={styles.read_only}
            >
              {lang.read_only}
            </Badge>
          ) : null}
        </Flex>
      </Box>

      <Flex align="center" justify="flex-end" gap={8}>
        {showToggleSwitch ? (
          <Flex align="center" mr="12px">
            <SwitchButton
              ariaLabel="Toggle current hosts"
              on={isOn}
              onChange={(on) => {
                setIsOn(on)
                if (currentHosts) agent.broadcast(events.toggle_item, currentHosts.id, on)
              }}
            />
          </Flex>
        ) : null}
        <ActionIcon
          aria-label="Toggle right panel"
          onClick={() => {
            agent.broadcast(events.toggle_right_panel, !showRightPanel)
          }}
          variant="subtle"
          color="gray"
        >
          {showRightPanel ? (
            <IconLayoutSidebarRightCollapse size={iconSize} stroke={iconStroke} />
          ) : (
            <IconLayoutSidebarRightExpand size={iconSize} stroke={iconStroke} />
          )}
        </ActionIcon>

        {showWindowControls ? (
          <>
            <Divider orientation="vertical" my={6} mx={4} />
            <ActionIcon
              aria-label="Minimize"
              variant="subtle"
              color="gray"
              onClick={() => getCurrentWindow().minimize()}
            >
              <IconMinus size={iconSize} stroke={iconStroke} />
            </ActionIcon>
            <ActionIcon
              aria-label="Maximize"
              variant="subtle"
              color="gray"
              onClick={() => getCurrentWindow().toggleMaximize()}
            >
              <IconSquare size={iconSize - 4} stroke={iconStroke} />
            </ActionIcon>
            <ActionIcon
              aria-label="Close window"
              variant="subtle"
              color="gray"
              onClick={() => actions.closeMainWindow()}
            >
              <IconX size={iconSize} stroke={iconStroke} />
            </ActionIcon>
          </>
        ) : null}
      </Flex>
    </div>
  )
}

export default TopBar
