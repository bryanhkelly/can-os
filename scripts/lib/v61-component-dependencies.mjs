import { posix } from "node:path";

const sharedPattern = /^src\/components\/(ui|workspace|workflow)(?:\/|$)/;
const sharedComponents = /^src\/components\/(?:ui|workspace|workflow)(?:\/|$)/;
const privilegedModules = /^src\/(?:modules|routes|db|workers|server)(?:\/|$)/;

/**
 * Enforce the three-layer CAN OS V6.1 component dependency graph.
 * This accepts both @/ aliases and relative paths, so a feature import
 * cannot evade the boundary simply by changing its import spelling.
 */
export function sharedUiImportViolation(file, specifier) {
  const normalizedFile = file.replaceAll("\\", "/");
  const match = normalizedFile.match(sharedPattern);
  if (!match) return null;
  const layer = match[1];
  const target = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(normalizedFile), specifier))
      : null;

  if (!target) return null; // External packages and builtins are allowed.
  if (privilegedModules.test(target))
    return "shared V6.1 presentation cannot import route, database, server or domain-command modules: " + specifier;
  if (layer === "ui" && target.startsWith("src/components/") &&
      !/^src\/components\/ui(?:\/|$)/.test(target))
    return "V6.1 primitives must not import higher-level components: " + specifier;
  if (layer !== "ui" && target.startsWith("src/components/") &&
      !sharedComponents.test(target) &&
      // Legacy role-home greeting still obtains the active member from the
      // thin shell session context. Keep this narrow until the home reader
      // owns its own greeting context; do not allow arbitrary shell imports.
      !/^src\/components\/shell\/workspace-session-context(?:\.ts)?$/.test(target))
    return "V6.1 workspace/workflow patterns cannot import feature components: " + specifier;
  return null;
}
