const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro') // make sure this import exists

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

// SVG transformer support
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer')
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg')
config.resolver.sourceExts.push('svg')

// Apply uniwind modifications before exporting
const uniwindConfig = withUniwindConfig(config, {
  // relative path to your global.css file
  cssEntryFile: './global.css',
  // optional: path to typings
  dtsFile: './uniwind-types.d.ts',
})

module.exports = uniwindConfig
