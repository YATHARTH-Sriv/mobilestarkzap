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

config.resolver.resolveRequest = (context, moduleName, platform) => {
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
