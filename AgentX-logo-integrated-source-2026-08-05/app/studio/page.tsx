import AgentStudio from "./studio";
import { requireAgentXUser } from "../auth";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await requireAgentXUser("/studio");
  return <AgentStudio userName={user.displayName} />;
}
