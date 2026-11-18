const { withDangerousMod } = require('expo/config-plugins');
const { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

const copyDirectory = (source, target) => {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source)) {
    const from = join(source, entry);
    const to = join(target, entry);
    if (statSync(from).isDirectory()) copyDirectory(from, to);
    else copyFileSync(from, to);
  }
};

/**
 * Copies web/dist-native into android/app/src/main/assets/web so the WebView
 * can load file:///android_asset/web/index.html without any network access.
 *
 * This is a plain CommonJS config plugin because Expo resolves plugins with
 * Node's require(), which does not load TypeScript files (not even on CI).
 */
const withWebAssets = (config) =>
  withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const source = join(projectRoot, '..', 'web', 'dist-native');
      const target = join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'web');

      if (!existsSync(source)) {
        throw new Error('Falta web/dist-native. Ejecutá "npm run build:native" en web/ antes de prebuild.');
      }

      copyDirectory(source, target);
      return modConfig;
    },
  ]);

module.exports = withWebAssets;
