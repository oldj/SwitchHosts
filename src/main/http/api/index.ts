/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Hono } from 'hono'
import list from './list'
import toggle from './toggle'

const router = new Hono()

router.get('/list', list)
router.get('/toggle', toggle)

export default router
