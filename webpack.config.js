/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const path = require('path')
const webpack = require('webpack')
const moment = require('moment')
const version = require('./app/version').version.join('.')

module.exports = {
  entry: {
    app: './ui/index.jsx'
    //, vendor: ['react', 'antd']
  },
  devtool: 'source-map',
  output: {
    path: path.join(__dirname, 'app', 'ui')
    , filename: 'bundle.js'
    , sourceMapFilename: 'bundle.js.map'
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        //exclude: [/node_modules/],
        use: ['babel-loader']
      }, {
        test: /\.less$/,
        use: ['style-loader', 'css-loader', 'less-loader']
      }, {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }, {
        test: /\.(eot|woff|woff2|ttf|svg|png|jpg)$/,
        use: 'url-loader?limit=30000&name=[name]-[hash].[ext]'
      }
    ]
    , noParse: [/\bAgent\b/]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production')
      }
    })
    //, new webpack.optimize.CommonsChunkPlugin({name: 'vendor', filename: 'common.js'})
    , new webpack.optimize.UglifyJsPlugin({
      sourceMap: true,
      compress: {
        warnings: false
        , drop_console: false
      }
      , output: {
        comments: false
      }
    })
    , new webpack.DllReferencePlugin({
      context: __dirname,
      manifest: require('./tmp/manifest.json')
    })
    , new webpack.IgnorePlugin(new RegExp('^(electron|fs|path)$'))
    , new webpack.BannerPlugin(`SwitchHosts! [file] v${version}, ${moment().format('YYYY-MM-DD HH:mm:ss')}`)
  ]
}
