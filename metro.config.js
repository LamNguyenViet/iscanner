const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Node built-ins needed by mammoth / word-extractor / officecrypto-tool.
const empty = path.resolve(__dirname, 'src/native/emptyModule.js');
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('react-native-quick-crypto'),
  buffer: require.resolve('buffer'),
  stream: require.resolve('readable-stream'),
  fs: empty,
  path: empty,
};

module.exports = config;
