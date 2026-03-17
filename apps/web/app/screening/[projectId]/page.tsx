import { redirect } from "next/navigation";

/** Legacy route — /screening/:id consolidated into /deals/:id?view=triage (2026 IA cleanup) */
export default function ScreeningProjectRedirect({
  params,
}: {
  params: { projectId: string };
}) {
  redirect(`/deals/${params.projectId}?view=triage`);
}
