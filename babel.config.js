module.exports = function babelConfig(api) {
  api.cache(true);
  let expoPreset = 'babel-preset-expo';
  try {
    require.resolve(expoPreset);
  } catch (error) {
    expoPreset = require.resolve('expo/node_modules/babel-preset-expo');
  }

  return {
    presets: [expoPreset],
  };
};
