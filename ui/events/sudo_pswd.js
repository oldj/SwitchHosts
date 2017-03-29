/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

import Agent from '../Agent'

module.exports = (app, pswd) => {
  Agent.pact('sudoPSWD', pswd)
}
