import { redirect } from "next/navigation";

/** Legacy route — /workflows/:id consolidated into /automation?tab=builder&workflow=:id (2026 IA cleanup) */
export default function WorkflowDetailRedirect({
  params,
}: {
  params: { workflowId: string };
}) {
  redirect(`/automation?tab=builder&workflow=${params.workflowId}`);
}
