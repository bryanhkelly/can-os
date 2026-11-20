import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";

interface Fields { siteName: string }

function CanonicalForm({ includeItem = true, includeProvider = true }: {
  includeItem?: boolean;
  includeProvider?: boolean;
}) {
  const form = useForm<Fields>({ defaultValues: { siteName: "Valor Academy" } });
  const field = <FormField control={form.control} name="siteName" render={({ field: value }) => {
    const contents = <>
      <FormLabel>Site name</FormLabel>
      <FormControl><Input {...value} aria-label="Site name" /></FormControl>
      <FormMessage />
    </>;
    return includeItem ? <FormItem>{contents}</FormItem> : contents;
  }} />;
  return includeProvider ? <Form {...form}>{field}</Form> : field;
}

describe("V6.1 canonical form context contract", () => {
  it("connects a managed label and control to the same generated id", () => {
    const html = renderToStaticMarkup(<CanonicalForm />);
    const id = html.match(/<label[^>]*for="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('value="Valor Academy"');
    expect(html).toContain("border-input");
  });

  it("reports absent FormField rather than accessing an undefined field", () => {
    expect(() => renderToStaticMarkup(<FormItem><FormLabel>Orphaned label</FormLabel></FormItem>))
      .toThrow("useFormField must be used within <FormField>");
  });

  it("reports absent FormItem rather than creating undefined input ids", () => {
    expect(() => renderToStaticMarkup(<CanonicalForm includeItem={false} />))
      .toThrow("useFormField must be used within <FormItem>");
  });

  it("reports absent FormProvider rather than accessing a null form", () => {
    expect(() => renderToStaticMarkup(<CanonicalForm includeProvider={false} />))
      .toThrow("useFormField must be used within <Form>");
  });
});
