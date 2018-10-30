/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const fs = require('fs')
const path = require('path')
const {work_path} = require('./paths')
const exec = require('child_process').exec
const platform = process.platform

function forMac (sudo_pswd, callback) {
  let cmd_fn = path.join(work_path, '_restart_net.sh')
  //let cmd = `for i in \`ifconfig | grep ": flags=" | sed -E 's/(.*): .*/\\1/g'\`;do sudo ifconfig $i down;sudo ifconfig $i up;done`
  let cmd = `
p1=/System/Library/LaunchDaemons/com.apple.mDNSResponder.plist
if [ -f $p1 ]; then
    launchctl unload -w $p1
    launchctl load -w $p1
fi

p2=/System/Library/LaunchDaemons/com.apple.discoveryd.plist
if [ -f p2 ]; then
    launchctl unload -w $p2
    launchctl load -w $p2
fi

killall -HUP mDNSResponder
`

  fs.writeFileSync(cmd_fn, cmd, 'utf-8')

  exec(`echo '${sudo_pswd}' | sudo -S /bin/sh ${cmd_fn}`, function (error, stdout, stderr) {
    if (fs.existsSync(cmd_fn)) {
      try {
        fs.unlink(cmd_fn)
      } catch (e) {
        alert(e.message)
      }
    }

    // command output is in stdout
    if (error) {
      console.log(error)
    }
    console.log(stdout, stderr)

    callback()
  })
}

module.exports = (sudo_pswd, callback) => {
  if (sudo_pswd && platform === 'darwin') {
    forMac(sudo_pswd, callback)
  } else {
    callback()
  }
}
