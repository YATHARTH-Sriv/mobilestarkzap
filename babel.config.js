module.exports = function (api) {
  api.cache(true);

  // Inline plugin that replaces import.meta with a safe fallback.
  // This catches any import.meta usage that slips past Metro resolution fixes.
  const transformImportMeta = {
    name: 'transform-import-meta',
    visitor: {
      MetaProperty(path) {
        // Replace `import.meta` with `{ url: '' }`
        path.replaceWithSourceString("({ url: '' })");
      },
    },
  };

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      () => transformImportMeta,
    ],
  };
};
