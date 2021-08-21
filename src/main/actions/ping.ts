/**
 * ping
 * @author: oldj
 * @homepage: https://oldj.net
 */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default async (ms: number = 1000): Promise<string> => {
  await wait(ms)
  return 'pong'
}
