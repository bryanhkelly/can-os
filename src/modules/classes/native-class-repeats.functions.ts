import { createServerFn } from "@tanstack/react-start";
import { authorizeNativeClassRepeatInput, listNativeClassRepeatCandidatesInput } from "./native-class-repeats.inputs";

export const authorizeNativeClassRepeat = createServerFn({ method: "POST" })
  .validator((input: unknown) => authorizeNativeClassRepeatInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./native-class-repeats.server");
    return implementation.authorizeNativeClassRepeat(data);
  });

export const listNativeClassRepeatCandidates = createServerFn({ method: "GET" })
  .validator((input: unknown) => listNativeClassRepeatCandidatesInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./native-class-repeats.server");
    return implementation.listNativeClassRepeatCandidates(data);
  });
