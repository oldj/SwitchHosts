/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

export default async (): Promise<string> => {
  // Windows 系统有可能不安装在 C 盘
  return process.platform === 'win32'
    ? `${process.env.windir || 'C:\\WINDOWS'}\\system32\\drivers\\etc\\hosts`
    : '/etc/hosts'
}
