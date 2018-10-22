/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const path = require('path')
const webpack = require('webpack')
const moment = require('moment')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const basedir = path.dirname(__dirname)

const vendors = [
  'react', 'react-dom', 'antd', 'lodash',
  'moment', 'classnames', 'codemirror'
]

module.exports = {
  mode: 'production',
  entry: {
    'common': vendors
  },
  output: {
    path: path.join(basedir, 'app', 'ui'),
    filename: '[name].js',
    library: '[name]'
  },
  optimization: {
    minimizer: [
      new UglifyJsPlugin({
        cache: true,
        parallel: true,
        uglifyOptions: {
          compress: true,
          ecma: 6,
          mangle: true,
          output: {
            ascii_only: true
          }
        },
        sourceMap: true
      })
    ]
  },
  plugins: [
    new webpack.DllPlugin({
      path: path.join(basedir, 'tmp', 'manifest.json'),
      name: '[name]',
      context: basedir
    }),
    new webpack.BannerPlugin(`SwitchHosts! common.js, ${moment().format('YYYY-MM-DD HH:mm:ss')}`)
  ]
}
