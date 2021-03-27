/**
 * @author oldj
 * @blog https://oldj.net
 */

'use strict'

const path = require('path')
const webpack = require('webpack')
const moment = require('moment')
const TerserPlugin = require('terser-webpack-plugin')
const basedir = path.dirname(__dirname)

const dependencies = Object.assign({}, require('../package.json').dependencies)

module.exports = {
  mode: 'production',
  entry: {
    common: Object.keys(dependencies)
  },
  output: {
    path: path.join(basedir, 'app', 'ui'),
    filename: '[name].js',
    library: '[name]'
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          output: {
            ecma: 5,
            comments: false,
            ascii_only: true
          }
        },
        parallel: true,
        cache: true,
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
