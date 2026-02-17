import { redirect } from "next/navigation";

export default function DealRoomProjectRedirect({
  params,
}: {
  params: { projectId: string };
}) {
  redirect(`/deals/${params.projectId}?tab=room`);
}
