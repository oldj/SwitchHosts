/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

export default async () => {
  let win = global.main_win
  win && win.isClosable() && win.close()
}
