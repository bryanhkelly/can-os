import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function ContextTray({ title, open, onClose, children, keepMounted = false }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode;
  keepMounted?: boolean;
}) {
  return <Modal open={open} onClose={onClose} label={title}
    keepMounted={keepMounted}
    className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-lg rounded-none border-l bg-background">
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b bg-card px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="outline" size="sm" onClick={onClose} aria-label={`Close ${title}`}>Close</Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{open && children}</div>
    </div>
  </Modal>;
}
