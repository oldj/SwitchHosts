/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

export default () => {
  let win = global.main_win
  if (!win) return

  win.webContents.toggleDevTools()
}
