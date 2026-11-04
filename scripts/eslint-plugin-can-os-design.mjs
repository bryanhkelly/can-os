const colorUtility = /(?:^|\s)(?:[a-z-]+:)*(?:bg|text|border|ring|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}(?:\/\d+)?(?=\s|$)/;

const noHardcodedColors = {
  meta: {
    type: "suggestion",
    docs: { description: "Prefer CAN semantic color utilities over palette-specific utilities" },
    schema: [],
    messages: { semantic: "Use semantic CAN color tokens instead of '{{value}}'." },
  },
  create(context) {
    function check(value, node) {
      const match = value.match(colorUtility);
      if (match) context.report({ node, messageId: "semantic", data: { value: match[0].trim() } });
    }
    return {
      Literal(node) {
        if (typeof node.value === "string") check(node.value, node);
      },
      TemplateElement(node) {
        check(node.value.cooked ?? "", node);
      },
    };
  },
};

const arbitraryTypeUtility = /(?:^|\s)(?:[a-z-]+:)*(?:text-\[(?:\d|length:)|tracking-\[|leading-\[\d)[^\]\s]*\]/;

const noArbitraryTypeValues = {
  meta: {
    type: "problem",
    docs: { description: "Type sizes and letter-spacing come from design tokens (text-3xs, text-2xs, text-section, tracking-eyebrow, …)" },
    schema: [],
    messages: { token: "Use a type token instead of the arbitrary value '{{value}}' (see docs/design-system-v6-1.md § Layout and type contract)." },
  },
  create(context) {
    function check(value, node) {
      const match = value.match(arbitraryTypeUtility);
      if (match) context.report({ node, messageId: "token", data: { value: match[0].trim() } });
    }
    return {
      Literal(node) { if (typeof node.value === "string") check(node.value, node); },
      TemplateElement(node) { check(node.value.cooked ?? "", node); },
    };
  },
};

const noRawPageStructure = {
  meta: {
    type: "problem",
    docs: { description: "Workspace pages render <main> and <h1> only through WorkspaceShell, PageFrame/PageTitle or DashboardHome" },
    schema: [],
    messages: {
      structure: "Render <{{name}}> through WorkspaceShell, PageFrame/PageTitle or DashboardHome so the page aligns to the shell grid.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type === "JSXIdentifier" && (node.name.name === "main" || node.name.name === "h1")) {
          context.report({ node, messageId: "structure", data: { name: node.name.name } });
        }
      },
    };
  },
};

const brandPrefix = /^\s*CAN OS\s*[·/]\s*\S/;

const noBrandPrefixedLabels = {
  meta: {
    type: "suggestion",
    docs: { description: "Eyebrows name the section; the shell already carries the CAN OS brand" },
    schema: [],
    messages: { brand: "Drop the 'CAN OS ·' prefix; the brand already sits in the shell." },
  },
  create(context) {
    function check(value, node) {
      if (brandPrefix.test(value)) context.report({ node, messageId: "brand" });
    }
    return {
      Literal(node) { if (typeof node.value === "string") check(node.value, node); },
      JSXText(node) { check(node.value, node); },
    };
  },
};

const parentheticalPlural = /\b[A-Za-z]+\((?:s|es)\)(?![\w(])/;

const noParentheticalPlurals = {
  meta: {
    type: "suggestion",
    docs: { description: "Counted copy agrees with its number instead of using 'item(s)'" },
    schema: [],
    messages: { plural: "Write '1 class' / '3 classes' with plural()/agree() from @/lib/format instead of '(s)' or '(es)'." },
  },
  create(context) {
    function check(value, node) {
      if (parentheticalPlural.test(value)) context.report({ node, messageId: "plural" });
    }
    return {
      Literal(node) { if (typeof node.value === "string") check(node.value, node); },
      TemplateElement(node) { check(node.value.cooked ?? node.value.raw, node); },
      JSXText(node) { check(node.value, node); },
    };
  },
};

const sectionTabsOnly = {
  meta: {
    type: "problem",
    docs: { description: "DetailNavigation tabs render through SectionTab so exactly one tab is current" },
    schema: [],
    messages: { tab: "Render tabs inside <DetailNavigation> with <SectionTab current link>; a bare <Link> lets partial search matching mark several tabs current." },
  },
  create(context) {
    let depth = 0;
    const isNav = node => node.name.type === "JSXIdentifier" && node.name.name === "DetailNavigation";
    return {
      JSXElement(node) { if (isNav(node.openingElement)) depth++; },
      "JSXElement:exit"(node) { if (isNav(node.openingElement)) depth--; },
      JSXOpeningElement(node) {
        if (depth > 0 && node.name.type === "JSXIdentifier" && (node.name.name === "Link" || node.name.name === "a")) {
          context.report({ node, messageId: "tab" });
        }
      },
    };
  },
};

const noRepeatedPrimary = {
  meta: {
    type: "suggestion",
    docs: { description: "A view has one primary action; per-item actions in lists use outline/ghost/link buttons" },
    schema: [],
    messages: { repeated: "This default (primary) Button repeats for every list item. Use variant=\"outline\" (or ghost/link); keep one primary action per view." },
  },
  create(context) {
    const isMapCallback = node => node.parent?.type === "CallExpression" && node.parent.callee.type === "MemberExpression"
      && node.parent.callee.property.type === "Identifier" && node.parent.callee.property.name === "map";
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "Button") return;
        if (node.attributes.some(attr => attr.type === "JSXAttribute" && attr.name.name === "variant")) return;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (parent.type === "JSXElement" && parent.openingElement.name.type === "JSXIdentifier" && parent.openingElement.name.name === "form") return;
          if ((parent.type === "ArrowFunctionExpression" || parent.type === "FunctionExpression") && isMapCallback(parent)) {
            context.report({ node, messageId: "repeated" });
            return;
          }
        }
      },
    };
  },
};

export default {
  rules: {
    "no-hardcoded-colors": noHardcodedColors,
    "no-arbitrary-type-values": noArbitraryTypeValues,
    "no-raw-page-structure": noRawPageStructure,
    "no-brand-prefixed-labels": noBrandPrefixedLabels,
    "no-parenthetical-plurals": noParentheticalPlurals,
    "section-tabs-only": sectionTabsOnly,
    "no-repeated-primary": noRepeatedPrimary,
  },
};
