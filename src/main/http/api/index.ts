/**
 * index
 * @author: oldj
 * @homepage: https://oldj.net
 */

import express from 'express'
import list from './list'
import toggle from './toggle'

const router = express.Router()

router.get('/list', list)
router.get('/toggle', toggle)

export default router
