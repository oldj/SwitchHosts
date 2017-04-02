'use strict'

const express = require('express')
const router = express.Router()
const list = require('./list')
const toggle = require('./toggle')

router.get('/list', list)
router.get('/toggle', toggle)

module.exports = router
