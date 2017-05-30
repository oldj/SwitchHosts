/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const path = require('path')
const webpack = require('webpack')
const moment = require('moment')
const basedir = path.dirname(__dirname)

const vendors = [
  'react', 'react-dom', 'antd', 'lodash',
  'moment', 'classnames', 'codemirror'
]

module.exports = {
  entry: {
    'lib': vendors
  },
  output: {
    path: path.join(basedir, 'app', 'ui'),
    filename: '[name].js',
    library: '[name]'
  },
  plugins: [
    new webpack.optimize.UglifyJsPlugin({
      sourceMap: true,
      compress: {
        warnings: false,
        screw_ie8: true,
        drop_console: true,
        drop_debugger: true
      }
    }),
    new webpack.DllPlugin({
      path: path.join(basedir, 'tmp', 'manifest.json'),
      name: '[name]',
      context: basedir
    }),
    new webpack.BannerPlugin(`SwitchHosts! lib.js, ${moment().format('YYYY-MM-DD HH:mm:ss')}`)
  ]
}
