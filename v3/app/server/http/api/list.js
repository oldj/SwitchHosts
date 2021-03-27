/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const getUserHosts = require('../../actions/getUserHosts')

module.exports = (req, res) => {
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
}
