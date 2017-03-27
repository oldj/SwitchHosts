/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const path = require('path')
const webpack = require('webpack')

module.exports = {
  entry: './src/ui/index.js',
  devtool: 'source-map',
  output: {
    path: path.join(__dirname, 'src')
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
        exclude: [/node_modules/],
        use: ['babel-loader?presets[]=react,presets[]=latest']
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
    ]//,
    // query: {
    // presets: ['es2015', 'stage-0', 'react']
    // }
    , noParse: [/renderer\/Agent/]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production')
      }
    })
    //, new webpack.optimize.UglifyJsPlugin({
    //  sourceMap: true,
    //  compress: {
    //    warnings: false
    //    , drop_console: false
    //  }
    //  , output: {
    //    comments: false
    //  }
    //})
    , new webpack.IgnorePlugin(new RegExp('^(electron|fs|path)$'))
  ]
}
