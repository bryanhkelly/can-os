/**
 * CAN OS V6.1 mechanical source migration, intentionally presentation-only.
 *
 * - Converts native JSX form controls to the existing shared React components.
 * - Preserves the HTML button's implicit submit default explicitly.
 * - Leaves native hidden inputs untouched.
 * - Maps radios/checkboxes to the matching canonical choice primitives.
 * - Removes Tailwind rounded utilities (the V6.1 radius is zero).
 * - Maps fixed utility palette colors to semantic state tokens.
 *
 * Review the resulting diff, typecheck and behavioral tests before release.
 * This is not a substitute for accessibility or interaction inspection.
 */
const names = { button: "Button", input: "Input", select: "Select", textarea: "Textarea", label: "Label" };
const importSource = {
  Button: "@/components/ui/button", Input: "@/components/ui/input",
  Select: "@/components/ui/select", Textarea: "@/components/ui/textarea",
  Label: "@/components/ui/label", Checkbox: "@/components/ui/choice", Radio: "@/components/ui/choice",
};
function tagEnd(source, start) {
  let quote = "", depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return i;
  }
  throw new Error("Unclosed JSX element at character " + start);
}
function buttonVariant(opening) {
  const cls = opening.match(/className\s*=\s*["']([^"']*)["']/)?.[1] ?? "";
  if (/\bbg-(?:destructive|danger|red-\d+)\b/.test(cls)) return "destructive";
  if (/\bbg-(?:primary|blue-\d+)\b/.test(cls)) return "default";
  if (/\bunderline\b/.test(cls) && !/\bborder\b/.test(cls)) return "ghost";
  if (/\bborder\b/.test(cls)) return "outline";
  return "ghost";
}
function semanticUtility(_match, kind, hue, shade) {
  const group = ({ red: "danger", rose: "danger", green: "success",
    emerald: "success", yellow: "warning", amber: "warning",
    blue: "info", indigo: "info" })[hue];
  if (!group) return _match;
  if (kind === "text") return "text-" + group;
  if (kind === "border") return "border-" + group + "/40";
  if (Number(shade) <= 200) return "bg-" + group + "/10";
  return "bg-" + group;
}
export function migrateV61Source(input, { controls = true, geometry = true, colors = true } = {}) {
  let output = input;
  const changes = { button: 0, input: 0, select: 0, textarea: 0,
    label: 0, Checkbox: 0, Radio: 0, corners: 0, colors: 0 };
  if (controls) {
    for (const tag of ["button", "input", "select", "textarea", "label"]) {
      const found = [...output.matchAll(new RegExp("<" + tag + "(?=[\\s/>])", "g"))];
      let touched = 0;
      for (let k = found.length - 1; k >= 0; k--) {
        const at = found[k].index;
        const end = tagEnd(output, at + tag.length + 1);
        let opening = output.slice(at, end + 1);
        if (tag === "input" && /\btype\s*=\s*["']hidden["']/.test(opening)) continue;
        let component = names[tag];
        if (tag === "input") {
          const choice = opening.match(/\btype\s*=\s*["'](checkbox|radio)["']/)?.[1];
          if (choice) {
            component = choice === "checkbox" ? "Checkbox" : "Radio";
            opening = opening.replace(/\s+type\s*=\s*["'](?:checkbox|radio)["']/, "");
            changes[component]++;
          }
        }
        if (tag === "button") {
          const variant = buttonVariant(opening);
          opening = opening.replace(/^<button/, "<Button");
          if (!/\bvariant\s*=/.test(opening))
            opening = opening.replace(/^<Button/, '<Button variant="' + variant + '"');
          // Native <button> without type defaults to submit, even outside forms.
          if (!/\btype\s*=/.test(opening))
            opening = opening.replace(/^<Button/, '<Button type="submit"');
        } else opening = opening.replace(new RegExp("^<" + tag), "<" + component);
        output = output.slice(0, at) + opening + output.slice(end + 1);
        changes[tag]++;
        touched++;
      }
      if (touched && tag !== "input")
        output = output.replace(new RegExp("</" + tag + "\\s*>", "g"), "</" + names[tag] + ">");
    }
    const rendered = new Set([...output.matchAll(/<(Button|Input|Select|Textarea|Label|Checkbox|Radio)(?=[\s/>])/g)]
      .map(match => match[1]));
    const imports = [];
    for (const component of rendered) {
      const alreadyImported = new RegExp("import\\s*\\{[^}]*\\b" + component +
        "\\b[^}]*\\}\\s*from\\s*[\"'][^\"']*[\"']", "m").test(output);
      if (!alreadyImported)
        imports.push('import { ' + component + ' } from "' + importSource[component] + '";');
    }
    if (imports.length) {
      const directive = output.match(/^(['"])use client\1;\s*/);
      const at = directive ? directive[0].length : 0;
      output = output.slice(0, at) + imports.join("\n") + "\n" + output.slice(at);
    }
  }
  if (geometry) {
    output = output.replace(/\brounded-(?:none|sm|md|lg|xl|2xl|3xl|full)\b|\brounded(?=[\s"'])/g, () => {
      changes.corners++;
      return "";
    });
  }
  if (colors) {
    output = output.replace(/\b(bg|text|border)-(red|rose|green|emerald|yellow|amber|blue|indigo)-(\d{2,3})\b/g,
      (match, kind, hue, shade) => { changes.colors++; return semanticUtility(match, kind, hue, shade); });
  }
  return { content: output, changes, modified: output !== input };
}
