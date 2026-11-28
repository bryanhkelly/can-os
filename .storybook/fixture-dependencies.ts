// Keep the same isolation boundary in the static build and the browser tests.
// These server exports require the production TanStack Start plugin and must
// never be eagerly optimized in an isolated fixture runtime.
export const storybookServerDependencyExclusions = [
  "@tanstack/react-start",
  "@tanstack/react-start/server",
  "@tanstack/react-start-server",
  "@tanstack/start-server-core",
];
