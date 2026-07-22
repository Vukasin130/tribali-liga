// This is a monorepo: npm hoists shared deps (react, react-native,
// @react-navigation/core, ...) to whichever node_modules folder actually
// ends up holding the single deduped copy - sometimes the workspace root,
// sometimes this app's own node_modules, depending on what else is installed
// elsewhere in the repo. If two different physical copies of react ever
// exist at once, Metro's default upward-walking resolver can pick the wrong
// one for a given requiring module, producing two live React instances at
// runtime ("Invalid hook call" / "useContext of null").
//
// Rather than hardcoding a path (which breaks the moment hoisting shifts,
// as happened here), resolve react/react-native the same way Node itself
// would from this file (respecting package.json main/exports), and force
// every requester in the graph to use that exact single resolved file.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

function resolveModuleFile(request) {
  return require.resolve(request, { paths: [__dirname] });
}

const FORCED_MODULES = {
  react: resolveModuleFile("react"),
  "react/jsx-runtime": resolveModuleFile("react/jsx-runtime"),
  "react/jsx-dev-runtime": resolveModuleFile("react/jsx-dev-runtime"),
  "react-native": resolveModuleFile("react-native")
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const forcedPath = FORCED_MODULES[moduleName];
  if (forcedPath) {
    return { type: "sourceFile", filePath: forcedPath };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
