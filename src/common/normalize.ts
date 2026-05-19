/**
 * normalize
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as os from 'os'

export interface INormalizeOptions {
  remove_duplicate_records?: boolean
}

interface IHostsLineObj {
  ip: string
  domains: string[]
  comment: string
}

interface IDomainsIPMap {
  [domain: string]: string
}

export const parseLine = (line: string): IHostsLineObj => {
  const [cnt, ...cmt] = line.split('#')
  const comment = cmt.join('#').trim()

  const [ip, ...domains] = cnt.trim().replace(/\s+/g, ' ').split(' ')

  return { ip, domains, comment }
}

export const formatLine = (o: Partial<IHostsLineObj>): string => {
  let comment = o.comment || ''
  if (comment) {
    comment = '# ' + comment
  }
  return [o.ip || '', (o.domains || []).join(' '), comment].join(' ').trim()
}

const removeDuplicateRecords = (content: string): string => {
  const domainIpMap: IDomainsIPMap = {}
  const lines = content.split('\n')
  const newLines: string[] = []

  lines.map((line) => {
    const { ip, domains, comment } = parseLine(line)

    if (!ip || domains.length === 0) {
      newLines.push(line)
      return
    }

    const ipv = /:/.test(ip) ? 6 : 4

    const newDomains: string[] = []
    const duplicateDomains: string[] = []
    domains.map((domain) => {
      const domainV = `${domain}_${ipv}`
      if (domainV in domainIpMap) {
        duplicateDomains.push(domain)
      } else {
        newDomains.push(domain)
        domainIpMap[domainV] = ip
      }
    })

    if (newDomains.length > 0) {
      newLines.push(formatLine({ ip, domains: newDomains, comment }))
    }
    if (duplicateDomains.length > 0) {
      newLines.push(
        formatLine({
          comment:
            'invalid hosts (repeated): ' +
            formatLine({ ip, domains: duplicateDomains }),
        }),
      )
    }
  })

  return newLines.join(os.EOL)
}

export default (
  hostsContent: string,
  options: INormalizeOptions = {},
): string => {
  // 在这儿执行去重等等操作
  if (options.remove_duplicate_records) {
    hostsContent = removeDuplicateRecords(hostsContent)
  }

  return hostsContent
}
