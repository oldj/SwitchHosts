/**
 * Startup recovery dialog shown when a recorded custom data directory can no
 * longer be used. Two cases:
 *  - `missing`: the folder was moved/deleted (its path is shown);
 *  - `invalid`: the pointer file is unreadable/corrupt, so the location is
 *    unknown (no path to show).
 * Not closeable — the user must pick one of three actions: use the default
 * location, choose a new folder, or quit. Each successful action restarts or
 * exits the app.
 */

import { Button, Code, Modal, Stack, Text } from '@mantine/core'
import { actions } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'

export interface DataDirRecovery {
  kind: 'missing' | 'invalid'
  path: string | null
}

interface Props {
  recovery: DataDirRecovery | null
}

const DataDirRecoveryModal = ({ recovery }: Props) => {
  const { lang } = useI18n()
  const [busy, setBusy] = useState(false)

  const isInvalid = recovery?.kind === 'invalid'
  const title = isInvalid ? lang.data_dir_invalid_title : lang.data_dir_missing_title

  const onUseDefault = async () => {
    setBusy(true)
    try {
      await actions.resetDataDir()
    } catch (e) {
      showErrorNotification({
        title,
        message: getErrorMessage(e, lang.fail),
      })
      setBusy(false)
    }
  }

  const onChooseNew = async () => {
    setBusy(true)
    try {
      const picked = await actions.pickDataDir()
      if (!picked) {
        setBusy(false)
        return
      }
      // No source to copy from (the old directory is gone), so just point
      // at the new location. If the user picked the default location the
      // backend treats it as a reset.
      await actions.applyDataDir({ target: picked.data_dir, copy: false })
    } catch (e) {
      showErrorNotification({
        title,
        message: getErrorMessage(e, lang.fail),
      })
      setBusy(false)
    }
  }

  return (
    <Modal
      opened={!!recovery}
      onClose={() => {}}
      centered
      title={title}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
    >
      <Stack gap="md">
        <Text size="sm">
          {isInvalid ? lang.data_dir_invalid_message : lang.data_dir_missing_message}
        </Text>
        {recovery?.path ? <Code block>{recovery.path}</Code> : null}
        <Stack gap="8px">
          <Button onClick={onUseDefault} loading={busy} fullWidth>
            {lang.data_dir_use_default}
          </Button>
          <Button onClick={onChooseNew} loading={busy} variant="default" fullWidth>
            {lang.data_dir_choose_new}
          </Button>
          <Button onClick={() => actions.quit()} variant="subtle" color="red" disabled={busy} fullWidth>
            {lang.quit}
          </Button>
        </Stack>
      </Stack>
    </Modal>
  )
}

export default DataDirRecoveryModal
