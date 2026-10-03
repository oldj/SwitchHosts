import type { IDomainResolution, IHostsListObject } from '@common/data'
import { getDomainList, getDomainResults } from '@common/dns'
import { Badge, Box, Group, Text } from '@mantine/core'
import useI18n from '@renderer/models/useI18n'
import styles from './DomainResolutionResults.module.scss'

interface DomainResolutionResultsProps {
  hosts: IHostsListObject
}

type DisplayResult = Omit<IDomainResolution, 'status'> & {
  status: IDomainResolution['status'] | 'pending'
}

const DomainResolutionResults = ({ hosts }: DomainResolutionResultsProps) => {
  const { lang, i18n } = useI18n()
  const cached = new Map(
    getDomainResults(hosts).map((result) => [result.domain.trim().toLowerCase(), result]),
  )
  const domains = [
    ...new Set(
      getDomainList(hosts)
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  // Cache rows remain available for refresh fallback. Display only the saved
  // list, including domains that have not received a result for that list yet.
  const results = domains.map<DisplayResult>((domain) => {
    const result = cached.get(domain)
    return result ? { ...result, domain } : { domain, ips: [], status: 'pending' }
  })
  if (!results.length) return null

  const counts = ['resolved', 'stale', 'failed'].map(
    (status) => results.filter((result) => result.status === status).length,
  )
  const pendingCount = results.filter((result) => result.status === 'pending').length
  const labels = {
    resolved: lang.domain_resolved,
    stale: lang.domain_stale,
    failed: lang.domain_failed,
    pending: lang.domain_pending,
  }
  const colors = { resolved: 'green', stale: 'orange', failed: 'red', pending: 'gray' }

  return (
    <details className={styles.results}>
      <summary>
        <span>{lang.domain_results}</span>
        <Text component="span" size="sm" c="dimmed">
          {[
            i18n.trans('domain_result_summary', counts.map(String)),
            pendingCount ? i18n.trans('domain_pending_count', [String(pendingCount)]) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </summary>
      <Box component="ul" className={styles.list}>
        {results.map((result) => (
          <Box component="li" key={result.domain} className={styles.item}>
            <Group gap="8px" justify="space-between" align="flex-start">
              <Text size="sm" fw={500} className={styles.domain}>
                {result.domain}
              </Text>
              <Badge color={colors[result.status]} variant="light" className={styles.status}>
                {labels[result.status]}
              </Badge>
            </Group>
            {result.ips.length ? (
              <Text size="xs" className={styles.ips}>
                {result.ips.join(', ')}
              </Text>
            ) : null}
            {result.error ? (
              <Text size="xs" c="dimmed" className={styles.error}>
                {result.error}
              </Text>
            ) : null}
            {result.last_success ? (
              <Text size="xs" c="dimmed">
                {i18n.trans('domain_last_success', [result.last_success])}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>
    </details>
  )
}

export default DomainResolutionResults
