/**
 * Confirm dialog for changing the data storage location. Shows the final
 * `SwitchHosts.data` target, an optional "copy existing data" choice, and
 * a red overwrite warning when the target already has data and copy is on.
 * On confirm the backend copies (if chosen), records the pointer, and
 * restarts the app — so a successful `applyDataDir` never resolves here.
 */

import { Button, Checkbox, Code, Group, Modal, Stack, Text } from '@mantine/core'
import { actions } from '@renderer/core/agent'
import { getErrorMessage, showErrorNotification } from '@renderer/core/notify'
import useI18n from '@renderer/models/useI18n'
import React, { useState } from 'react'

interface Props {
  opened: boolean
  onClose: () => void
  dataDir: string
  isEmpty: boolean
}

const ChangeDataDirModal = ({ opened, onClose, dataDir, isEmpty }: Props) => {
  const { lang } = useI18n()
  const [copy, setCopy] = useState(true)
  const [loading, setLoading] = useState(false)

  const onConfirm = async () => {
    setLoading(true)
    try {
      // On success the backend restarts the app, so this promise never
      // resolves; we only get here when it fails.
      await actions.applyDataDir({ target: dataDir, copy })
    } catch (e) {
      showErrorNotification({
        title: lang.data_dir_change_title,
        message: getErrorMessage(e, lang.fail),
      })
      setLoading(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={lang.data_dir_change_title}
      withCloseButton={!loading}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      <Stack gap="md">
        <Code block>{dataDir}</Code>
        <Text size="sm" c="dimmed">
          {lang.data_dir_subfolder_note}
        </Text>
        <Checkbox
          checked={copy}
          onChange={(e) => setCopy(e.currentTarget.checked)}
          label={lang.data_dir_copy_existing}
          disabled={loading}
        />
        {!isEmpty && copy ? (
          <Text size="sm" c="red">
            {lang.data_dir_overwrite_warning}
          </Text>
        ) : null}
        <Group justify="flex-end" gap="12px">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {lang.btn_cancel}
          </Button>
          <Button loading={loading} onClick={onConfirm}>
            {lang.btn_ok}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

export default ChangeDataDirModal
