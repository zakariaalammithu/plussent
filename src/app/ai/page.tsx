import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";
import AiChat from "./AiChat";

export default async function AiAssistantPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  return (
    <AppShell current="/ai" title="AI Assistant" subtitle={sess.workspace?.name ?? ""}>
      <AiChat />
    </AppShell>
  );
}
