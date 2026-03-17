import { redirect } from "next/navigation";

/** Legacy route — /deal-room/:id consolidated into /deals/:id?tab=room (2026 IA cleanup) */
export default function DealRoomProjectRedirect({
  params,
}: {
  params: { projectId: string };
}) {
  redirect(`/deals/${params.projectId}?tab=room`);
}
