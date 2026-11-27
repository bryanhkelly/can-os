import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../.storybook/guides/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  staticDirs: [
    { from: "./assets/fonts/licenses", to: "/font-licenses" },
    { from: "../public/school-template-previews", to: "/school-template-previews" },
  ],
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: { viteConfigPath: "storybook.vite.config.ts" },
    },
  },
};

export default config;
