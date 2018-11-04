/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict'

const path = require('path')
const webpack = require('webpack')
const moment = require('moment')
const WebpackNotifierPlugin = require('webpack-notifier')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const LSSPluginLists = require('less-plugin-lists')
const version = require('./app/version').version.join('.')

module.exports = {
    entry: {
        app: './app-ui/index.jsx'
        //, vendor: ['react', 'antd']
    },
    devtool: 'source-map',
    output: {
        path: path.join(__dirname, 'app', 'ui')
        , filename: '[name].js'
        , sourceMapFilename: '[name].js.map'
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
                //exclude: [/node_modules/, /antd/],
                loader: ExtractTextPlugin.extract({
                    fallback: 'style-loader',
                    use: [
                        'css-loader?minimize&modules&sourceMap&localIdentName=[name]--[local]--[hash:base64:5]',
                        {
                            loader: 'less-loader?outputStyle=expanded',
                            options: {
                                plugins: [
                                    new LSSPluginLists({advanced: true})
                                ]
                            }
                        }
                    ]
                })
            }, {
                test: /\.css$/,
                loader: ExtractTextPlugin.extract({
                    fallback: 'style-loader',
                    use: 'css-loader?importLoaders=1&minimize&sourceMap'
                })
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
        , new ExtractTextPlugin({
            filename: '[name].css',
            allChunks: true
        })
        , new webpack.DllReferencePlugin({
            context: __dirname,
            manifest: require('./tmp/manifest.json')
        })
        , new webpack.IgnorePlugin(new RegExp('^(electron|fs|path)$'))
        , new WebpackNotifierPlugin({
            title: 'SwitchHosts!',
            alwaysNotify: true
        })
        , new webpack.BannerPlugin(`SwitchHosts! [file] v${version}, ${moment().format('YYYY-MM-DD HH:mm:ss')}`)
    ]
}
