import { redirect } from "next/navigation";

/** Legacy route — /deal-room consolidated into /deals?view=triage (2026 IA cleanup) */
export default function DealRoomRedirect() {
  redirect("/deals?view=triage");
}
