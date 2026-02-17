import { redirect } from "next/navigation";

export default function WorkflowDetailRedirect({
  params,
}: {
  params: { workflowId: string };
}) {
  redirect(`/automation?tab=builder&workflow=${params.workflowId}`);
}
