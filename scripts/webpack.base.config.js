'use strict'

const path = require('path')

module.exports = {
  mode: 'development',
  output: {
    path: path.resolve(__dirname, '..', 'build'),
    filename: '[name].js',
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.json'],
  },
  devtool: 'source-map',
  plugins: [],
}
