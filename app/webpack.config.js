/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const path = require('path');
const webpack = require('webpack');
const uglifyJsPlugin = webpack.optimize.UglifyJsPlugin;

module.exports = {
    entry: './src/ui.js',
    devtool: 'source-map',
    output: {
        path: path.join(__dirname, 'build'),
        filename: 'bundle.js'
    },
    resolve: {
        extensions: ['', '.js', '.jsx']
    },
    module: {
        loaders: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                loaders: ['babel?presets[]=react,presets[]=es2015']
            }, {
                test: /\.less$/,
                loaders: ['style', 'css', 'less']
            }, {
                test: /\.css$/,
                loaders: ['style', 'css']
            },
            {
                test: /\.(eot|woff|woff2|ttf|svg|png|jpg)$/,
                loader: 'url-loader?limit=30000&name=[name]-[hash].[ext]'
            }
        ]//,
        // query: {
        // presets: ['es2015', 'stage-0', 'react']
        // }
    },
    plugins: [
        // new uglifyJsPlugin({
        //     compress: {
        //         warnings: false
        //     }
        // })
    ]
};
