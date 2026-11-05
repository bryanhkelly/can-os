import { cloneElement, forwardRef, useId, type AriaAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { Label } from "./label";
import { cn } from "@/lib/utils";

export const FieldError = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ id, className, children, ...props }, ref) => {
    if (!children) return null;
    return <p ref={ref} id={id} role="alert" className={cn("text-sm text-destructive", className)} {...props}>{children}</p>;
  },
);
FieldError.displayName = "FieldError";

export function Field({ label, description, error, required, children, className }: {
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactElement<AriaAttributes & { id?: string; required?: boolean }>;
  className?: string;
}) {
  const generatedId = useId();
  const id = children.props.id || generatedId;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [...new Set([
    ...(children.props["aria-describedby"]?.split(/\s+/).filter(Boolean) ?? []),
    ...(description ? [descriptionId] : []),
    ...(error ? [errorId] : []),
  ])].join(" ") || undefined;
  return <div className={cn("space-y-2", className)}>
    <Label htmlFor={id} className={error ? "text-destructive" : undefined}>
      {label}{required && <span className="ml-1 text-xs text-muted-foreground">(required)</span>}
    </Label>
    {cloneElement(children, {
      id,
      required: required ?? children.props.required,
      "aria-invalid": error ? true : children.props["aria-invalid"],
      "aria-describedby": describedBy,
    })}
    {description && <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>}
    <FieldError id={errorId}>{error}</FieldError>
  </div>;
}
