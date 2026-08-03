// This app bundles apps/mobile's source files directly into its own Metro graph
// (imported via the @tribali-liga/mobile workspace package, through apps/mobile/shared.ts).
// That means every React-Context-based singleton library that both this app's own code
// and the imported mobile code touch is exposed to the classic monorepo-hoisting bug
// apps/mobile/metro.config.js already had to fix once (two physical copies of a package
// resolving in the same graph -> "Invalid hook call" / broken context). Force every
// dependency shared with apps/mobile to one physical copy, generated from apps/mobile's
// own dependency list so this doesn't silently drift out of date.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const mobilePkg = require("../mobile/package.json");

function resolveModuleFile(request) {
  return require.resolve(request, { paths: [__dirname] });
}

const FORCED_MODULES = {};
for (const dep of Object.keys(mobilePkg.dependencies)) {
  try {
    FORCED_MODULES[dep] = resolveModuleFile(dep);
  } catch {
    // Not resolvable from apps/desktop (e.g. a native-only module with no web/JS
    // entry point reachable this way) - leave it to default resolution.
  }
}
FORCED_MODULES["react/jsx-runtime"] = resolveModuleFile("react/jsx-runtime");
FORCED_MODULES["react/jsx-dev-runtime"] = resolveModuleFile("react/jsx-dev-runtime");

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
