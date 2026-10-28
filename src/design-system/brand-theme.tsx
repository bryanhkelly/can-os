import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BrandTokens {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
}

export const defaultBrandTokens: BrandTokens = {
  primary: "#1769ef",
  primaryForeground: "#ffffff",
  accent: "#eaf1ff",
  accentForeground: "#101d39",
};

function channel(value: string, start: number) {
  return Number.parseInt(value.slice(start, start + 2), 16) / 255;
}

function luminance(hex: string) {
  const values = [channel(hex, 1), channel(hex, 3), channel(hex, 5)].map(value =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}

export function contrastRatio(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function resolveBrandTokens(input: Partial<BrandTokens> = {}) {
  const tokens = { ...defaultBrandTokens, ...input };
  const issues: string[] = [];
  for (const [name, value] of Object.entries(tokens)) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) issues.push(`${name} must be a six-digit hex color`);
  }
  if (issues.length === 0) {
    const pairs: Array<[keyof BrandTokens, keyof BrandTokens | "card" | "canvas", string, string]> = [
      ["primaryForeground", "primary", tokens.primaryForeground, tokens.primary],
      ["accentForeground", "accent", tokens.accentForeground, tokens.accent],
      ["primary", "accent", tokens.primary, tokens.accent],
      ["primary", "card", tokens.primary, "#ffffff"],
      ["primary", "canvas", tokens.primary, "#f6f8fb"],
    ];
    for (const [foreground, background, first, second] of pairs) {
      if (contrastRatio(first, second) < 4.5) issues.push(`${foreground} on ${background} must reach 4.5:1`);
    }
  }
  return { tokens: issues.length ? defaultBrandTokens : tokens, issues };
}

type BrandStyle = CSSProperties & Record<`--brand-${string}`, string>;

export function brandThemeStyle(input: Partial<BrandTokens> = {}): BrandStyle {
  const { tokens } = resolveBrandTokens(input);
  return {
    "--brand-primary": tokens.primary,
    "--brand-primary-foreground": tokens.primaryForeground,
    "--brand-accent": tokens.accent,
    "--brand-accent-foreground": tokens.accentForeground,
  };
}

export function BrandTheme({ brand, children, className }: {
  brand?: Partial<BrandTokens>;
  children: ReactNode;
  className?: string;
}) {
  return <div data-can-brand="true" className={cn("min-h-screen bg-background text-foreground", className)}
    style={brandThemeStyle(brand)}>{children}</div>;
}
