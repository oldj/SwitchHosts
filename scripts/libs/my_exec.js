const { spawn } = require('child_process')

module.exports = function myExec(cmd, ...args) {
  return new Promise((resolve, reject) => {
    const run = spawn(cmd, args)

    let out = ''

    run.stdout.on('data', (data) => {
      console.log(`[stdout]: ${data.toString().trimEnd()}`)
      out += data.toString()
    })

    run.stderr.on('data', (data) => {
      console.log(`[stderr]: ${data.toString().trimEnd()}`)
    })

    run.on('exit', function (code) {
      console.log('child process exited with code ' + code.toString())
      if (code === 0) {
        resolve(out)
      } else {
        reject(code)
      }
    })
  })
}
