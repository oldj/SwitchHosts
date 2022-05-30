/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { useModel } from '@@/plugin-model/useModel'
import HostsEditor from '@renderer/components/Editor/HostsEditor'
import { actions } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import events from '@root/common/events'
import React, { useEffect, useState } from 'react'
import styles from './index.less'
import { useToast } from '@chakra-ui/react'

interface Props {}

const MainPanel = (props: Props) => {
  const { current_hosts } = useModel('useHostsData')
  const [system_hosts_content, setSystemHostsContent] = useState('')
  const toast = useToast()

  useEffect(() => {
    if (!current_hosts) {
      actions.getSystemHosts().then((value) => setSystemHostsContent(value))
    }
  }, [current_hosts])

  useOnBroadcast(
    events.system_hosts_updated,
    () => {
      if (!current_hosts) {
        actions.getSystemHosts().then((value) => setSystemHostsContent(value))
      }
    },
    [current_hosts],
  )

  useOnBroadcast(events.cmd_run_result, (result) => {
    // console.log(result)
    if (!result.success) {
      toast({
        status: 'error',
        description: result.stderr || 'cmd run error',
        isClosable: true,
      })
    }
  })

  return (
    <div className={styles.root}>
      <HostsEditor
        hosts={
          current_hosts || {
            id: '0',
            content: system_hosts_content,
          }
        }
      />
    </div>
  )
}

export default MainPanel
