import type { IDomainResolution, IHostsListObject } from './data'
import { extractDomain, isValidDomain } from './hostsFn'

export type DnsProviderId = 'alidns' | 'dnspod' | 'cloudflare' | 'google' | 'custom'

export const DNS_PROVIDERS: { value: DnsProviderId; label: string }[] = [
  { value: 'alidns', label: 'Ali DoH' },
  { value: 'dnspod', label: 'DNSPod' },
  { value: 'cloudflare', label: 'Cloudflare' },
  { value: 'google', label: 'Google' },
  { value: 'custom', label: 'Custom' },
]

export const dnsProviderLabel = (id: string | undefined): string => {
  const hit = DNS_PROVIDERS.find((p) => p.value === (id || 'alidns'))
  return hit ? hit.label : 'Custom'
}

// An explicitly empty list must not resurrect the legacy domain in `url`.
export const getDomainList = (hosts?: Partial<IHostsListObject> | null): string[] => {
  if (hosts?.domains !== undefined) {
    return Array.isArray(hosts.domains)
      ? hosts.domains.filter((domain): domain is string => typeof domain === 'string')
      : []
  }
  return typeof hosts?.url === 'string' && hosts.url ? [hosts.url] : []
}

// Imported files can contain arbitrary metadata. Ignore malformed cache rows
// without preventing the domain list from being opened and repaired.
export const getDomainResults = (hosts: Partial<IHostsListObject>): IDomainResolution[] => {
  if (!Array.isArray(hosts.domain_results)) return []
  const seen = new Set<string>()
  return hosts.domain_results.flatMap((result) => {
    if (
      !result ||
      typeof result.domain !== 'string' ||
      !result.domain ||
      seen.has(result.domain) ||
      !['resolved', 'stale', 'failed'].includes(result.status) ||
      !Array.isArray(result.ips) ||
      !result.ips.every((ip) => typeof ip === 'string')
    ) {
      return []
    }
    seen.add(result.domain)
    return [
      {
        domain: result.domain,
        status: result.status,
        ips: result.ips,
        error: typeof result.error === 'string' ? result.error : undefined,
        last_success: typeof result.last_success === 'string' ? result.last_success : undefined,
        last_success_ms:
          typeof result.last_success_ms === 'number' ? result.last_success_ms : undefined,
      },
    ]
  })
}

export interface ParsedDomains {
  domains: string[]
  errors: { line: number; value: string }[]
  duplicates: number
  normalized: number
}

export const parseDomains = (text: string): ParsedDomains => {
  const result: ParsedDomains = { domains: [], errors: [], duplicates: 0, normalized: 0 }
  const seen = new Set<string>()
  text.split(/\r\n|\n|\r/).forEach((line, index) => {
    const value = line.trim()
    if (!value) return
    // Split only at line boundaries: invalid space-separated input must not
    // be silently truncated into a valid-looking domain.
    const domain = /\s/.test(value) ? null : extractDomain(value)?.toLowerCase()
    if (!domain) {
      result.errors.push({ line: index + 1, value })
      return
    }
    if (domain !== value) result.normalized += 1
    if (seen.has(domain)) {
      result.duplicates += 1
    } else {
      seen.add(domain)
      result.domains.push(domain)
    }
  })
  return result
}

export const getRefreshTime = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

const refreshMillis = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

// Only server-owned refresh metadata belongs in refresh event updates.
export const getRefreshMetadata = (hosts: IHostsListObject): Partial<IHostsListObject> => ({
  last_refresh: getRefreshTime(hosts.last_refresh),
  last_refresh_ms: refreshMillis(hosts.last_refresh_ms),
  last_attempt: getRefreshTime(hosts.last_attempt),
  last_attempt_ms: refreshMillis(hosts.last_attempt_ms),
  domain_results: hosts.domain_results,
  domain_refresh_status: hosts.domain_refresh_status,
})

export const getRefreshTarget = (hosts: IHostsListObject): string | null => {
  if (hosts.type !== 'remote') return null
  const source = hosts.source || 'url'
  if (source === 'url') {
    return typeof hosts.url === 'string' && hosts.url.trim()
      ? JSON.stringify(['url', hosts.url.trim()])
      : null
  }
  if (source !== 'domain') return null
  const values = hosts.domains === undefined ? [hosts.url] : hosts.domains
  if (!Array.isArray(values) || !values.every((value): value is string => typeof value === 'string')) {
    return null
  }
  const domains = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))]
  return !domains.length || domains.some((domain) => !isValidDomain(domain))
    ? null
    : JSON.stringify(['domain', domains])
}

// Events, command replies and list reloads can arrive out of order. A refresh
// only belongs to the same saved target, and must not roll its metadata back.
export const mergeRefreshMetadata = (
  current: IHostsListObject | null,
  incoming: IHostsListObject,
): IHostsListObject | null => {
  if (!current || current.id !== incoming.id) return current
  const target = getRefreshTarget(current)
  if (!target || target !== getRefreshTarget(incoming)) return current
  const revision = (item: IHostsListObject) =>
    refreshMillis(item.last_attempt_ms) ?? refreshMillis(item.last_refresh_ms) ?? -1
  if (revision(incoming) < revision(current)) return current
  return { ...current, ...getRefreshMetadata(incoming) }
}
