import * as path from 'path'
import { defineConfig } from 'umi'

const is_dev = process.env.NODE_ENV === 'development'

export default defineConfig({
  title: 'SwitchHosts',
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
  dynamicImport: {
    loading: '@renderer/components/Loading',
  },
  cssLoader: {
    modules: {
      localIdentName: is_dev ? '[path][name]__[local]' : '[hash:base64]',
    },
  },
  webpack5: {},
  // mfsu: {},
})
