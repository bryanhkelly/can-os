import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSessionContext } from "../src/components/shell/workspace-session-context";
import type { Preview } from "@storybook/react-vite";
import { BrandTheme } from "../src/design-system/brand-theme";
import "../src/styles.css";
import "./assets/fonts/fonts.css";
import { viewports, baselineModes } from "./viewports";

function FixtureProviders({ children }: { children: ReactNode }) {
  // Each story gets its own query cache and an explicitly signed-out synthetic
  // session. Never mount the live session provider, polling or activity RPC.
  const [client] = useState(() => new QueryClient({defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0 }, mutations: { retry: false } }}));
  return <QueryClientProvider client={client}><WorkspaceSessionContext.Provider value={{session:null,error:null}}>{children}</WorkspaceSessionContext.Provider></QueryClientProvider>;
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Semantic theme and controlled institutional branding",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        dynamicTitle: true,
        items: [
          { value: "light", title: "Platform light" },
          { value: "dark", title: "Platform dark" },
          { value: "site", title: "Validated site brand" },
        ],
      },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    Story => <FixtureProviders><Story /></FixtureProviders>,
    (Story, context) => {
      if (context.globals.theme === "site") {
        return <div data-storybook-theme="site"><BrandTheme brand={{
          primary: "#075b50",
          primaryForeground: "#ffffff",
          accent: "#e5f4f0",
          accentForeground: "#102a26",
        }}><Story /></BrandTheme></div>;
      }
      return <div data-storybook-theme={context.globals.theme === "dark" ? "dark" : "light"} className={context.globals.theme === "dark" ? "dark bg-background text-foreground" : "bg-background text-foreground"}>
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
    viewport: { options: viewports },
    chromatic: { modes: baselineModes },
    options: {
      storySort: {
        order: ["00 Start here","01 Foundations","02 Primitives","03 Components","04 Application patterns","05 Page layouts","06 Interaction states","07 Persona experiences","08 Feature workspaces","09 Public experiences","10 User journeys","11 Accessibility and responsive","12 Engineering and acceptance"],
      },
    },
  },
  tags: ["autodocs"],
};

export default preview;
