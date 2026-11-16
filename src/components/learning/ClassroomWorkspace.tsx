import { useId, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, PanelRightClose, PanelRightOpen, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mutationErrorMessage } from "@/lib/mutation-feedback";

export type ClassroomReturnTo = "academic" | "native" | "training";

function ReturnToClasses({target}:{target:ClassroomReturnTo}){
  return target==="academic"?<Link to="/classes" className="underline">My classes</Link>:
    target==="native"?<Link to="/learn/classes" className="underline">My classes</Link>:
    <Link to="/learn/my-courses" className="underline">My classes</Link>;
}

export function ClassroomWorkspace({ title, subtitle, lessonTitle, lessonPosition, metadata, actions, rail, children, returnTo="academic" }: {
  title: string; subtitle: string; lessonTitle?: string; rail: ReactNode; children: ReactNode;
  lessonPosition?: { current: number; total: number };
  metadata?: ReactNode;
  actions?: ReactNode;
  returnTo?: ClassroomReturnTo;
}) {
  const [toolsVisible, setToolsVisible] = useState(true);
  const toolsId = useId();
  const [shareNotice, setShareNotice] = useState("");
  const [shareError, setShareError] = useState("");
  async function share() {
    setShareNotice(""); setShareError("");
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNotice("Class link copied. Only authorized class members can open it.");
    } catch (error) {
      setShareError(mutationErrorMessage(error, "Unable to copy this link. Copy the address from your browser."));
    }
  }
  return <main className="classroom-workspace min-h-screen bg-background text-foreground">
    <div className="classroom-focus-bar flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
      <div className="min-w-0"><p className="font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{lessonPosition ? `Lesson ${lessonPosition.current} · ` : ""}{lessonTitle ?? "Your classroom"}</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" aria-expanded={toolsVisible} aria-controls={toolsId} onClick={() => setToolsVisible(value => !value)}>
          {toolsVisible ? <PanelRightClose aria-hidden="true"/> : <PanelRightOpen aria-hidden="true"/>}
          {toolsVisible ? "Hide lesson tools" : "Show lesson tools"}
        </Button>
        <Button variant="ghost" size="sm" asChild>{returnTo==="academic"?<Link to="/classes"><ArrowLeft aria-hidden="true"/>Exit classroom</Link>:
        returnTo==="native"?<Link to="/learn/classes"><ArrowLeft aria-hidden="true"/>Exit classroom</Link>:
        <Link to="/learn/my-courses"><ArrowLeft aria-hidden="true"/>Exit classroom</Link>}</Button>
      </div>
    </div>
    <div className="classroom-content">
      <header className="classroom-header">
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><ReturnToClasses target={returnTo}/><span>/</span>{title}{lessonPosition && <><span>/</span><span>Lesson {lessonPosition.current}</span></>}</nav>
        <div className="flex flex-wrap items-end justify-between gap-4"><div className="min-w-0 flex-1">
        <p className="can-eyebrow">Your classroom</p>
        <h1 className="mt-2 font-serif text-2xl font-normal tracking-tight sm:text-3xl">{title}</h1>
        {lessonTitle && <h2 className="mt-1 font-serif text-lg font-normal tracking-tight sm:text-xl">{lessonTitle}</h2>}
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </div><div className="flex flex-wrap gap-2">{actions}
          <Button size="sm" variant="outline" onClick={() => void share()}><Share2 aria-hidden="true"/>Share class link</Button>
        </div></div>
        {metadata && <div className="classroom-meta">{metadata}</div>}
        {shareNotice && <p role="status" className="mt-3 text-xs">{shareNotice}</p>}
        {shareError && <p role="alert" className="mt-3 text-xs text-destructive">{shareError}</p>}
      </header>
      <div className={toolsVisible ? "classroom-columns" : undefined}>
        <div className="min-w-0">{children}</div>
        <aside id={toolsId} aria-label="Lesson tools" hidden={!toolsVisible} className="classroom-tools space-y-4">{rail}</aside>
      </div>
    </div>
  </main>;
}
