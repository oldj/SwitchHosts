import events from '@common/events'
import { AppDownloadedUpdateInfo, AppUpdateInfo, AppUpdateProgress } from '@common/update'
import { Button, Group, Modal, Progress, Stack, Text } from '@mantine/core'
import { actions } from '@renderer/core/agent'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useI18n from '@renderer/models/useI18n'
import { useState } from 'react'

type UpdateStage = 'available' | 'downloading' | 'downloaded'

const emptyProgress: AppUpdateProgress = {
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
}

const UpdateDialog = () => {
  const { i18n, lang } = useI18n()
  const [opened, setOpened] = useState(false)
  const [stage, setStage] = useState<UpdateStage>('available')
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [progress, setProgress] = useState<AppUpdateProgress>(emptyProgress)
  const [isInstalling, setIsInstalling] = useState(false)

  // The dialog mirrors the updater lifecycle as a small state machine:
  // available -> downloading -> downloaded.
  useOnBroadcast(events.new_version, (info: AppUpdateInfo) => {
    setUpdateInfo(info)
    setProgress(emptyProgress)
    setStage('available')
    setOpened(true)
  })

  useOnBroadcast(events.update_download_progress, (info: AppUpdateProgress) => {
    setProgress(info)
    setStage('downloading')
    setOpened(true)
  })

  useOnBroadcast(events.update_downloaded, (info: AppDownloadedUpdateInfo) => {
    setUpdateInfo(info)
    setProgress({
      ...emptyProgress,
      percent: 100,
    })
    setStage('downloaded')
    setOpened(true)
  })

  const onClose = () => {
    if (stage === 'downloading' || isInstalling) {
      return
    }

    setOpened(false)
  }

  const onDownload = async () => {
    if (!updateInfo) {
      return
    }

    setProgress(emptyProgress)
    setStage('downloading')

    try {
      await actions.downloadUpdate()
    } catch (error) {
      console.error(error)
      setStage('available')
      alert(error instanceof Error ? error.message : String(error))
    }
  }

  const onInstall = async () => {
    setIsInstalling(true)

    try {
      await actions.installUpdate()
    } catch (error) {
      console.error(error)
      setIsInstalling(false)
      alert(error instanceof Error ? error.message : String(error))
    }
  }

  if (!updateInfo) {
    return null
  }

  const isDownloading = stage === 'downloading'
  const progressText = `${Math.round(progress.percent)}%`

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      title={lang.new_version_found}
      withCloseButton={!isDownloading && !isInstalling}
      closeOnClickOutside={!isDownloading && !isInstalling}
      closeOnEscape={!isDownloading && !isInstalling}
    >
      <Stack gap="16px">
        {updateInfo.releaseName ? <Text fw={600}>{updateInfo.releaseName}</Text> : null}

        <Text size="sm" c="dimmed">
          {stage === 'available' && i18n.trans('latest_version_desc', [updateInfo.version])}
          {stage === 'downloading' &&
            i18n.trans('update_downloading_desc', [updateInfo.version, progressText])}
          {stage === 'downloaded' && i18n.trans('update_ready_desc', [updateInfo.version])}
        </Text>

        {updateInfo.releaseNotes ? (
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }} lineClamp={6}>
            {updateInfo.releaseNotes}
          </Text>
        ) : null}

        {isDownloading ? (
          <Stack gap="8px">
            <Progress value={progress.percent} animated />
            <Text size="xs" c="dimmed">
              {progressText}
            </Text>
          </Stack>
        ) : null}

        <Group justify="flex-end">
          {stage !== 'downloading' ? (
            <Button variant="outline" onClick={onClose} disabled={isInstalling}>
              {lang.btn_cancel}
            </Button>
          ) : null}

          {stage === 'available' ? (
            <Button onClick={onDownload}>{lang.update_download_now}</Button>
          ) : null}

          {stage === 'downloaded' ? (
            <Button onClick={onInstall} loading={isInstalling}>
              {lang.update_install_now}
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Modal>
  )
}

export default UpdateDialog
