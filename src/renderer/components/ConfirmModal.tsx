import { Button, Group, Modal, Text } from '@mantine/core'
import useI18n from '@renderer/models/useI18n'
import React from 'react'

interface Props {
  opened: boolean
  onClose: () => void
  onConfirm: () => void
  title?: React.ReactNode
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

const ConfirmModal = ({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
}: Props) => {
  const { lang } = useI18n()

  const onClickConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} centered title={title} withCloseButton={false}>
      <Text mb="lg">{message}</Text>
      <Group justify="flex-end" gap="12px">
        <Button variant="outline" onClick={onClose}>
          {cancelLabel || lang.btn_cancel}
        </Button>
        <Button color={danger ? 'red' : undefined} onClick={onClickConfirm}>
          {confirmLabel || lang.btn_ok}
        </Button>
      </Group>
    </Modal>
  )
}

export default ConfirmModal
