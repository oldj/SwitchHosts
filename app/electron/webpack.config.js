/**
 * @author oldj
 * @blog http://oldj.net
 */

'use strict';

const path = require('path');

module.exports = {
    entry: './src/entry.js',
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
            },
            {
                test: /\.(eot|woff|woff2|ttf|svg|png|jpg)$/,
                loader: 'url-loader?limit=30000&name=[name]-[hash].[ext]'
            }
        ]//,
        // query: {
            // presets: ['es2015', 'stage-0', 'react']
        // }
    }
};
