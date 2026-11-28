import { afterEach } from "vitest";
import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import { setProjectAnnotations } from "@storybook/react-vite";
import * as projectAnnotations from "./preview";

setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

// A Vite transform/runtime failure can render an error overlay before axe
// runs. Preserve the underlying diagnostic instead of treating the overlay
// as a product accessibility violation. Never remove or hide the overlay.
afterEach(() => {
  const overlays = Array.from(document.querySelectorAll("vite-error-overlay"));
  if (!overlays.length) return;
  const details = overlays.map(overlay => {
    const root = overlay.shadowRoot ?? overlay;
    const messages = Array.from(root.querySelectorAll(".plugin, .message, .file, .frame, .stack"))
      .map(element => element.textContent?.trim()).filter(Boolean);
    return [...new Set(messages)].join("\n") || overlay.textContent?.trim() || "No diagnostic text available";
  });
  throw new Error("Storybook Vite runtime error overlay:\n" + details.join("\n---\n"));
});
