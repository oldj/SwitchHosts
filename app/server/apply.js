/**
 * @author oldj
 * @blog https://oldj.net
 *
 * try to apply hosts
 */

'use strict'

const path = require('path')
const exec = require('child_process').exec
const io = require('./io')
const {sys_host_path, work_path} = require('./paths')
const crypto = require('crypto')
const md5File = require('md5-file')
const platform = process.platform

let sudo_pswd = ''

function needPswd(str) {
  str = str.toLowerCase()

  console.log('---')
  console.log(str)
  let keys = [
    'Permission denied'
    , 'incorrect password'
    , 'Password:Sorry, try again.'
  ]
  return !!keys.find(k => str.includes(k.toLowerCase()))
}

function apply_Unix (content, callback) {
  let tmp_fn = path.join(work_path, 'tmp.txt')

  if (typeof content !== 'string') {
    callback('bad content')
    return
  }

  io.pWriteFile(tmp_fn, content)
    .then(() => {
      let cmd

      if (!sudo_pswd) {
        cmd = [
          `cat "${tmp_fn}" > ${sys_host_path}`
          , `rm -rf ${tmp_fn}`
        ].join(' && ')
      } else {
        sudo_pswd = sudo_pswd.replace(/'/g, '\\x27')
        cmd = [
          `echo '${sudo_pswd}' | sudo -S chmod 777 ${sys_host_path}`
          , `cat "${tmp_fn}" > ${sys_host_path}`
          , `echo '${sudo_pswd}' | sudo -S chmod 644 ${sys_host_path}`
          // , 'rm -rf ' + tmp_fn
        ].join(' && ')
      }

      return cmd
    })
    .then(cmd => {
      exec(cmd, function (error, stdout, stderr) {
        // command output is in stdout
        if (!error) {
          callback()
          return
        }

        callback(!sudo_pswd || needPswd(stdout + stderr) ? 'need_sudo' : error)
      })
    })
}

function apply_Win32 (content, callback) {
  // todo
}

function tryToApply (...args) {
  if (platform !== 'win32') {
    apply_Unix(...args)
  } else {
    apply_Win32(...args)
  }
}

module.exports = (cnt, pswd) => {
  if (pswd) {
    sudo_pswd = pswd
  }

  return new Promise((resolve, reject) => {
    let file_md5 = md5File.sync(sys_host_path)
    let cnt_md5 = crypto.createHash('md5').update(cnt).digest('hex')

    if (file_md5 === cnt_md5) {
      // 文件相同
      resolve()
      return
    }

    tryToApply(cnt, e => e ? reject(e) : resolve())
    //reject('need_sudo')
  })
}
