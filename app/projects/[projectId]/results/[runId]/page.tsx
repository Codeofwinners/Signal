import { Workspace } from "@/components/workspace";
export default async function ResultPage({
  params,
}: {
  params: Promise<{ projectId: string; runId: string }>;
}) {
  const { projectId, runId } = await params;
  return <Workspace initialProjectId={projectId} initialRunId={runId} />;
}
