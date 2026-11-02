import AgentStudio from "../studio/studio";

// Temporary visual-QA route for the studio-live-view package. Delete after QA.
export const dynamic = "force-dynamic";

export default function StudioLiveViewQA() {
  return <AgentStudio userName="QA preview" />;
}
