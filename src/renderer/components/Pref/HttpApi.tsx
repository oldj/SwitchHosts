import { defaultHttpApiPort } from '@common/constants'
import { ConfigsType } from '@common/default_configs'
import events from '@common/events'
import { Box, Button, Checkbox, Divider, Group, NumberInput, Stack, Text } from '@mantine/core'
import DescriptionText, { checkboxDescriptionStyles } from '@renderer/components/DescriptionText'
import { actions } from '@renderer/core/agent'
import { getErrorMessage } from '@renderer/core/notify'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import useI18n from '@renderer/models/useI18n'
import { useEffect, useRef, useState } from 'react'

interface ApiError {
  code: string
  port: number
  reason: string
}

interface ApiStatus {
  running: boolean
  address: string | null
  error: ApiError | null
}

interface Props {
  data: ConfigsType
  onSave: (patch: Partial<ConfigsType>) => Promise<void>
}

export default function HttpApi({ data, onSave }: Props) {
  const { lang, i18n } = useI18n()
  const [port, setPort] = useState<number | string>(data.http_api_port)
  const [pending, setPending] = useState<Partial<ConfigsType> | null>(null)
  const savingRef = useRef(false)
  const [error, setError] = useState<unknown>(null)
  const [status, setStatus] = useState<ApiStatus | null>(null)
  const [statusFailed, setStatusFailed] = useState(false)
  const requestId = useRef(0)
  const valid = /^\d+$/.test(String(port)) && Number(port) >= 1 && Number(port) <= 65535
  const dirty = Number(port) !== data.http_api_port
  const saving = pending !== null
  const enabled = pending?.http_api_on ?? data.http_api_on
  const onlyLocal = pending?.http_api_only_local ?? data.http_api_only_local
  const address = !statusFailed && status?.running ? status.address : null

  useEffect(() => {
    // A saved/broadcast port replaces the local draft; unrelated settings do not.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPort(data.http_api_port)
  }, [data.http_api_port])

  const refreshStatus = async () => {
    const id = ++requestId.current
    try {
      const next: ApiStatus = await actions.httpApiStatus()
      if (id === requestId.current) {
        setStatus(next)
        setStatusFailed(false)
      }
    } catch {
      if (id === requestId.current) setStatusFailed(true)
    }
  }

  useEffect(() => {
    // Fetch actual backend state; updates happen after IPC resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatus()
    // Also catch a listener task that exits after startup or a missed event.
    const timer = setInterval(() => void refreshStatus(), 5000)
    const requests = requestId
    return () => {
      clearInterval(timer)
      requests.current++
    }
  }, [])
  useOnBroadcast(events.http_api_status_changed, refreshStatus)

  const errorMessage = (failure: unknown): string => {
    const apiError = failure as Partial<ApiError> | null
    const value = String(apiError?.port ?? data.http_api_port)
    switch (apiError?.code) {
      case 'address_in_use':
        return i18n.trans('http_api_port_in_use', [value])
      case 'permission_denied':
        return i18n.trans('http_api_port_denied', [value])
      default:
        return getErrorMessage(failure, lang.http_api_unavailable)
    }
  }

  const save = async (patch: Partial<ConfigsType>) => {
    if (savingRef.current) return
    savingRef.current = true
    setPending(patch)
    setError(null)
    try {
      await onSave(patch)
    } catch (failure) {
      setError(failure)
    } finally {
      await refreshStatus()
      savingRef.current = false
      setPending(null)
    }
  }

  return (
    <Stack gap="8px">
      <Checkbox
        checked={enabled}
        aria-disabled={saving}
        onClick={(event) => {
          if (savingRef.current) event.preventDefault()
        }}
        onChange={(event) => void save({ http_api_on: event.target.checked })}
        label={lang.http_api_on}
        description={lang.http_api_description}
        styles={checkboxDescriptionStyles}
      />
      <Stack gap="12px" pl="28px">
        <Checkbox
          disabled={!enabled}
          aria-disabled={!enabled || saving}
          checked={onlyLocal}
          onClick={(event) => {
            if (savingRef.current) event.preventDefault()
          }}
          onChange={(event) => void save({ http_api_only_local: event.target.checked })}
          label={lang.http_api_only_local}
        />
        <Box>
          <Text component="label" htmlFor="http-api-port" size="sm">
            {lang.http_api_port}
          </Text>
          <Group gap="8px" mt="6px" align="flex-start">
            <NumberInput
              id="http-api-port"
              w={125}
              inputMode="numeric"
              min={1}
              max={65535}
              step={1}
              allowDecimal={false}
              allowNegative={false}
              allowLeadingZeros={false}
              clampBehavior="none"
              value={port}
              readOnly={pending?.http_api_port !== undefined}
              aria-describedby="http-api-port-help"
              aria-invalid={!valid}
              onChange={(value) => {
                setPort(value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && valid && dirty && !saving) {
                  event.preventDefault()
                  void save({ http_api_port: Number(port) })
                }
              }}
            />
            <Button
              variant="default"
              loading={pending?.http_api_port !== undefined}
              aria-disabled={saving || !valid || !dirty}
              disabled={!valid || !dirty}
              onClick={() => void save({ http_api_port: Number(port) })}
            >
              {lang.http_api_save_port}
            </Button>
            <Button
              variant="subtle"
              disabled={Number(port) === defaultHttpApiPort}
              aria-disabled={saving || Number(port) === defaultHttpApiPort}
              onClick={() => {
                if (savingRef.current) return
                setPort(defaultHttpApiPort)
                setError(null)
              }}
            >
              {lang.http_api_reset_port}
            </Button>
          </Group>
          <Box id="http-api-port-help">
            <DescriptionText mt="6px">{lang.http_api_port_help}</DescriptionText>
          </Box>
          {!valid && (
            <Text c="red" size="sm" role="alert">
              {lang.http_api_port_invalid}
            </Text>
          )}
          {error != null && (
            <Text c="red" size="sm" role="alert">
              {errorMessage(error)}
            </Text>
          )}
        </Box>
        <Divider />
        <Box aria-live="polite">
          <Text size="sm">
            {statusFailed
              ? lang.http_api_status_unknown
              : !status
                ? lang.loading
                : status.running
                  ? lang.http_api_listening
                  : status.error
                    ? lang.http_api_unavailable
                    : lang.http_api_stopped}
          </Text>
          <Text
            size="sm"
            ff="monospace"
            aria-hidden={!address}
            style={{ overflowWrap: 'anywhere' }}
          >
            {address || '\u00a0'}
          </Text>
          {!statusFailed && status && !status.running && status.error && (
            <Text c="red" size="sm">
              {errorMessage(status.error)}
            </Text>
          )}
        </Box>
        <DescriptionText>{lang.http_api_port_clients}</DescriptionText>
      </Stack>
    </Stack>
  )
}
