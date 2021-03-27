/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const path = require('path')
const webpack = require('webpack')
//const moment = require('moment')
const WebpackNotifierPlugin = require('webpack-notifier')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const LESSPluginLists = require('less-plugin-lists')
const TerserPlugin = require('terser-webpack-plugin')
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin')
//const version = require('../app/version').join('.')
const UpVersionPlugin = require('./webpack_up_version')
const basedir = path.dirname(__dirname)

const mini_css_loader = {
  loader: MiniCssExtractPlugin.loader,
  options: {
    // you can specify a publicPath here
    // by default it uses publicPath in webpackOptions.output
    //publicPath: '../',
    hmr: process.env.NODE_ENV === 'development'
  }
}

module.exports = {
  mode: 'production',
  entry: {
    app: './app-ui/index.jsx'
    //, vendor: ['react', 'antd']
  },
  devtool: 'source-map',
  output: {
    path: path.join(__dirname, '..', 'app', 'ui'),
    filename: '[name].js',
    sourceMapFilename: '[name].js.map'
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        //exclude: [/node_modules/],
        use: ['babel-loader?sourceMap']
      },
      {
        test: /\.css$/,
        exclude: /(codemirror|animate\.css)/,
        loader: [
          mini_css_loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              sourceMap: true
            }
          }
        ]
      },
      {
        test: /\.less$/,
        exclude: /(node_modules|antd)/,
        loader: [
          mini_css_loader,
          //'css-loader?minimize&modules&sourceMap&localIdentName=[path][name]--[local]',
          //'style-loader',
          {
            loader: 'css-loader',
            options: {
              importLoaders: 2,
              //modules: true,
              //camelCase: true,
              //javascriptEnabled: true,
              sourceMap: true,
              modules: {
                mode: 'local',
                //context: path.resolve(__dirname, 'src'),
                //hashPrefix: 'wonderpen-',
                //localIdentName: '[path][name]__[local]--[hash:base64:5]',
                localIdentName: '[folder]__[name]__[local]'
              }
            }
          },
          {
            loader: 'less-loader?outputStyle=expanded',
            options: {
              lessOptions: {
                javascriptEnabled: true,
                plugins: [
                  new LESSPluginLists({advanced: true})
                ]
              }
            }
          }
        ]
      },
      {
        test: /codemirror\b.*\.css|animate\.css$/,
        loader: [
          mini_css_loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              sourceMap: true
            }
          }
        ]
      },
      {
        test: /antd\.less$/,
        loader: [
          mini_css_loader,
          //'css-loader?minimize&sourceMap',
          {
            loader: 'css-loader',
            options: {
              //importLoaders: 1,
              sourceMap: true
            }
          },
          {
            loader: 'less-loader',
            options: {
              javascriptEnabled: true
            }
          }
        ]
      },
      {
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        use: [
          {
            loader: 'babel-loader'
          },
          {
            loader: '@svgr/webpack',
            options: {
              babel: false,
              icon: true,
              replaceAttrValues: {
                '#000000': 'currentColor',
                '#000': 'currentColor'
              }
            }
          }
        ]
      },
      {
        test: /\.(eot|woff|woff2|ttf|png|jpg|svg\?bg)$/,
        //use: 'url-loader?limit=30000&name=[name]-[hash].[ext]'
        use: [
          {
            loader: 'url-loader',
            options: {
              limit: 30000,
              name: '[name]-[hash].[ext]'
            }
          }
        ]
      }
    ],
    noParse: [/\bAgent\b/]
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
      }),
      new OptimizeCSSAssetsPlugin({})
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production')
      }
    }),
    new UpVersionPlugin({
      fn: path.join(basedir, 'app', 'version.js'),
      packages: [path.join(basedir, 'package.json'), path.join(basedir, 'app', 'package.json')],
    }),
    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      // both options are optional
      filename: '[name].css',
      chunkFilename: '[id].css'
    }),
    new webpack.DllReferencePlugin({
      context: __dirname,
      manifest: require('../tmp/manifest.json')
    }),
    new webpack.IgnorePlugin(new RegExp('^(electron|fs|path)$')),
    new WebpackNotifierPlugin({
      title: 'SwitchHosts!',
      alwaysNotify: true,
      excludeWarnings: true
    })
    //new webpack.BannerPlugin(`SwitchHosts! [file] v${version}, ${moment().format('YYYY-MM-DD HH:mm:ss')}`)
  ]
}
