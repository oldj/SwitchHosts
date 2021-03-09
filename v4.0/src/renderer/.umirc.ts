import { defineConfig } from 'umi'
import * as path from 'path'

export default defineConfig({
  title: 'SwitchHosts!',
  hash: true,
  history: {
    type: 'hash',
  },
  publicPath: './',
  outputPath: '../../build/renderer',
  nodeModulesTransform: {
    type: 'none',
  },
  alias: {
    '@main': path.join(path.dirname(__dirname), 'main'),
    '@renderer': __dirname,
    '@root': path.dirname(__dirname),
    '@@': path.join(path.dirname(__dirname), 'renderer', '.umi'),
  },
  webpack5: {},
})
