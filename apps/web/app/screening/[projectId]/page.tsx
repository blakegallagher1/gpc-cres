import { redirect } from "next/navigation";

export default function ScreeningProjectRedirect({
  params,
}: {
  params: { projectId: string };
}) {
  redirect(`/deals/${params.projectId}?view=triage`);
}
