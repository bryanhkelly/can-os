/**
 * CAN OS V6.1 form-control geometry and interaction contract.
 *
 * Native HTML belongs only to the primitives. Sharing these classes prevents
 * Input, Select, Textarea and Choice from quietly diverging on focus, disabled
 * or invalid states. Keep every utility as a static string for Tailwind's scanner.
 */
export const focusRingClasses =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const disabledControlClasses =
  "disabled:cursor-not-allowed disabled:opacity-50";

export const invalidFieldClasses =
  "aria-invalid:border-destructive aria-invalid:ring-destructive";

export const fieldSurfaceClasses =
  "w-full border border-input bg-card px-3 py-2 text-foreground shadow-sm transition-colors";

export const fieldControlClasses = [
  fieldSurfaceClasses,
  focusRingClasses,
  disabledControlClasses,
  invalidFieldClasses,
].join(" ");

export const textEntryClasses =
  "text-base placeholder:text-muted-foreground md:text-sm";
