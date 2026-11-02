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

export default {
  rules: { "no-hardcoded-colors": noHardcodedColors },
};
