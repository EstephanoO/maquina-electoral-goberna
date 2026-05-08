/**
 * Expo config plugin: fix iOS build errors caused by react-native-firebase v24
 * + `useFrameworks: 'static'` on Expo SDK 54+ / Xcode 26+.
 *
 * Patches to the iOS Podfile:
 *
 *   1. Insert `use_modular_headers!` at the start of the target block.
 *   2. In the post_install hook, on every pod target/configuration:
 *        a. CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES
 *           (legacy escape — honored by Xcode <26).
 *        b. Append `-Wno-error=non-modular-include-in-framework-module` to
 *           OTHER_CFLAGS. Xcode 26 forces `-Werror=non-modular-include-in-
 *           framework-module` directly on the clang command line and no
 *           longer honors CLANG_ALLOW for this diagnostic, so we downgrade
 *           the Werror back to a warning at the cflags level. This is the
 *           canonical 2026 workaround for the RNFB v24 + Xcode 26 break.
 *
 * Reference: invertase/react-native-firebase#7745, expo/expo#28956.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER_HEADER = '# >>> rnfb-modular-headers (use_modular_headers!) <<<';
const MARKER_BUILDSETTING = '# >>> rnfb-modular-headers (xcode26-fix) <<<';
const BUILD_SETTING_BLOCK = `    ${MARKER_BUILDSETTING}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        other_cflags = config.build_settings['OTHER_CFLAGS']
        other_cflags = ['$(inherited)'] if other_cflags.nil?
        other_cflags = [other_cflags] unless other_cflags.is_a?(Array)
        flag = '-Wno-error=non-modular-include-in-framework-module'
        other_cflags << flag unless other_cflags.include?(flag)
        config.build_settings['OTHER_CFLAGS'] = other_cflags
      end
    end
`;

const withModularHeaders = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile',
      );
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      // Patch 1: use_modular_headers! at top of target block
      if (!contents.includes(MARKER_HEADER)) {
        const targetRegex = /(target ['"][^'"]+['"] do[^\n]*\n)/;
        if (!targetRegex.test(contents)) {
          throw new Error(
            'with-modular-headers: could not find a `target ... do` block in Podfile',
          );
        }
        contents = contents.replace(
          targetRegex,
          `$1  ${MARKER_HEADER}\n  use_modular_headers!\n`,
        );
      }

      // Patch 2: CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES
      // injected inside the existing post_install block (Expo always generates
      // one). Falls back to appending a new post_install if absent.
      if (!contents.includes(MARKER_BUILDSETTING)) {
        const postInstallRegex = /(post_install do \|installer\|\n)/;
        if (postInstallRegex.test(contents)) {
          contents = contents.replace(
            postInstallRegex,
            `$1${BUILD_SETTING_BLOCK}`,
          );
        } else {
          contents += `\npost_install do |installer|\n${BUILD_SETTING_BLOCK}end\n`;
        }
      }

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};

module.exports = withModularHeaders;
