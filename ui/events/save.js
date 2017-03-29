/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, list) => {
  Agent.pact('saveHosts', list)
}
