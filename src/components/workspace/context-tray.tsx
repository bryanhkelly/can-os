import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ContextTray({ title, open, onClose, children }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-lg border-l bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/30">
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b bg-card px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="outline" size="sm" onClick={onClose} aria-label={`Close ${title}`}>Close</Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{open && children}</div>
    </div>
  </dialog>;
}
