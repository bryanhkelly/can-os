import type { Preview } from "@storybook/react-vite";
import { BrandTheme } from "../src/design-system/brand-theme";
import "../src/styles.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Semantic theme and controlled institutional branding",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        dynamicTitle: true,
        items: [
          { value: "light", title: "CAN light" },
          { value: "dark", title: "CAN dark" },
          { value: "site", title: "Validated site brand" },
        ],
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (Story, context) => {
      if (context.globals.theme === "site") {
        return <BrandTheme brand={{
          primary: "#075b50",
          primaryForeground: "#ffffff",
          accent: "#e5f4f0",
          accentForeground: "#102a26",
        }}><Story /></BrandTheme>;
      }
      return <div className={context.globals.theme === "dark" ? "dark" : undefined}>
        <Story />
      </div>;
    },
  ],
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: { test: "error" },
    chromatic: { viewports: [390, 1440] },
    options: {
      storySort: {
        order: ["Foundations", "Workflows", "Personas", "Branding"],
      },
    },
  },
  tags: ["autodocs"],
};

export default preview;
