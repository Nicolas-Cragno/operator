const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, "..", "cantapp-components")];
const shared = ["react", "react-dom", "react-native", "react-native-web"];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (shared.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))) {
    return context.resolveRequest(context, path.resolve(__dirname, "node_modules", moduleName), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
