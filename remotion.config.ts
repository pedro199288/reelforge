// See all configuration options: https://remotion.dev/docs/config
// Each option also is available as a CLI flag: https://remotion.dev/docs/cli

// Note: When using the Node.JS APIs, the config file doesn't apply. Instead, pass options directly to the APIs

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';
import path from 'path';

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.overrideWebpackConfig((config) => {
  // Apply Tailwind
  const tailwindConfig = enableTailwind(config);

  // Add path aliases to match tsconfig.json
  return {
    ...tailwindConfig,
    resolve: {
      ...tailwindConfig.resolve,
      alias: {
        ...tailwindConfig.resolve?.alias,
        '@': path.resolve(__dirname, 'src'),
      },
    },
  };
});
