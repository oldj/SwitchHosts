'use strict'

const express = require('express')
const router = express.Router()
const paths = require('../../paths')
const getUserHosts = require('../../actions/getUserHosts')
const saveHosts = require('../../actions/saveHosts')
const svr = require('../../svr')

router.get('/list', (req, res) => {
  getUserHosts()
    .then(list => {
      let data = {
        success: true,
        data: list
      }
      res.end(JSON.stringify(data))
    })
    .catch(e => {
      res.end(e.toString())
    })
})

router.get('/toggle', (req, res) => {
  let id = req.param('id')

  getUserHosts()
    .then(list => {
      let item = list.find(i => i.id === id)
      if (!item) {
        res.end('not-found:' + id)
        return
      }

      item.on = !item.on
      saveHosts(svr, list)
        .then(() => {
          svr.broadcast('reload')
          res.end('toggle:' + id)
        })
    })
})

module.exports = router
