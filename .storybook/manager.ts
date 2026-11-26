import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

// Manager chrome only. Application component colors come from src/styles.css.
addons.setConfig({
  theme:create({
    base:"light",brandTitle:"Becomuna · Design System V6.1",
    brandUrl:"?path=/docs/00-start-here-welcome--docs",brandTarget:"_self",
    colorPrimary:"#101d39",colorSecondary:"#1769ef",
    appBg:"#f6f8fb",appContentBg:"#ffffff",appBorderColor:"#e2e8f0",
    appBorderRadius:0,fontBase:'"DM Sans", system-ui, sans-serif',
    fontCode:'"JetBrains Mono", monospace',
  }),
  sidebar:{showRoots:true},
});
