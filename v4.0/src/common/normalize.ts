/**
 * normalize
 * @author: oldj
 * @homepage: https://oldj.net
 */

const default_options = {
  remove_duplicate_records: false,
}

type INormalizeOptions = Partial<typeof default_options>

export default (hosts_content: string, options: INormalizeOptions = {}): string => {
  // todo 在这儿执行去重等等操作

  return hosts_content
}
