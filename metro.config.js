const { getDefaultConfig } = require("expo/metro-config");
const { withStarkzap } = require("starkzap-native/metro");

const config = withStarkzap(getDefaultConfig(__dirname));

const originalResolveRequest = config.resolver.resolveRequest;

function resolveRequestWithFallback(context, moduleName, platform) {
	if (typeof originalResolveRequest === "function") {
		return originalResolveRequest(context, moduleName, platform);
	}

	return context.resolveRequest(context, moduleName, platform);
}

// Packages whose ESM entries use `import.meta` which Metro/Hermes can't handle.
// Force them to resolve via the CJS (default) entry instead.
const FORCE_CJS_ON_WEB = new Set([
	"valtio",
	"ox",
]);

function shouldForceCjs(name) {
	if (FORCE_CJS_ON_WEB.has(name)) return true;
	// Match subpath imports like "valtio/vanilla", "ox/trusted-setups/..."
	for (const pkg of FORCE_CJS_ON_WEB) {
		if (name.startsWith(pkg + "/")) return true;
	}
	return false;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
	// Force uuid to resolve via browser ESM entry on web.
	if (moduleName === "uuid" && platform === "web") {
		return context.resolveRequest(
			{
				...context,
				unstable_enablePackageExports: true,
				unstable_conditionNames: ["browser", "import"],
			},
			moduleName,
			platform
		);
	}

	// Force packages with import.meta to use CJS entry on web.
	if (platform === "web" && shouldForceCjs(moduleName)) {
		return context.resolveRequest(
			{
				...context,
				unstable_enablePackageExports: false,
			},
			moduleName,
			platform
		);
	}

	if (moduleName === "isows" || moduleName.startsWith("zustand")) {
		const ctx = {
			...context,
			unstable_enablePackageExports: false,
		};
		return resolveRequestWithFallback(ctx, moduleName, platform);
	}

	if (moduleName === "jose") {
		const ctx = {
			...context,
			unstable_conditionNames: ["browser"],
		};
		return resolveRequestWithFallback(ctx, moduleName, platform);
	}

	return resolveRequestWithFallback(context, moduleName, platform);
};

module.exports = config;
