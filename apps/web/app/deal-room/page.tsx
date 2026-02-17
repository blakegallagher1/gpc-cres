import { redirect } from "next/navigation";

export default function DealRoomRedirect() {
  redirect("/deals?view=triage");
}
