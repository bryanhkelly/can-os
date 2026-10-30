import { createFileRoute } from "@tanstack/react-router";
import { AskCanConversation } from "@/components/conversation/AskCanConversation";
import { WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/ask")({ component: AskCanPage });

function AskCanPage() {
  return <WorkspaceShell width="reading" eyebrow="CAN OS · Ask CAN" title="Ask CAN"
    subtitle="Answers and actions use your permissions. Proposed changes require your confirmation.">
    <AskCanConversation/>
  </WorkspaceShell>;
}
