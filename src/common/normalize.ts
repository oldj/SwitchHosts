/**
 * normalize
 * @author: oldj
 * @homepage: https://oldj.net
 */

import * as os from 'os'

const default_options = {
  remove_duplicate_records: false,
}

export type INormalizeOptions = Partial<typeof default_options>

interface IHostsLineObj {
  ip: string
  domains: string[]
  comment: string
}

interface IDomainsIPMap {
  [domain: string]: string
}

export const parseLine = (line: string): IHostsLineObj => {
  let [cnt, ...cmt] = line.split('#')
  let comment = cmt.join('#').trim()

  let [ip, ...domains] = cnt.trim().replace(/\s+/g, ' ').split(' ')

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
  let domain_ip_map: IDomainsIPMap = {}
  let lines = content.split('\n')
  let new_lines: string[] = []

  lines.map((line) => {
    let { ip, domains, comment } = parseLine(line)

    if (!ip || domains.length === 0) {
      new_lines.push(line)
      return
    }

    const ipv = /:/.test(ip) ? 6 : 4

    let new_domains: string[] = []
    let duplicate_domains: string[] = []
    domains.map((domain) => {
      const domain_v = `${domain}_${ipv}`
      if (domain_v in domain_ip_map) {
        duplicate_domains.push(domain)
      } else {
        new_domains.push(domain)
        domain_ip_map[domain_v] = ip
      }
    })

    if (new_domains.length > 0) {
      new_lines.push(formatLine({ ip, domains: new_domains, comment }))
    }
    if (duplicate_domains.length > 0) {
      new_lines.push(
        formatLine({
          comment:
            'invalid hosts (repeated): ' +
            formatLine({ ip, domains: duplicate_domains }),
        }),
      )
    }
  })

  return new_lines.join(os.EOL)
}

export default (
  hosts_content: string,
  options: INormalizeOptions = {},
): string => {
  // 在这儿执行去重等等操作
  if (options.remove_duplicate_records) {
    hosts_content = removeDuplicateRecords(hosts_content)
  }

  return hosts_content
}
