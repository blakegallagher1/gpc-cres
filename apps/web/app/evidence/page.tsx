import { redirect } from "next/navigation";

export default function EvidenceRedirect() {
  redirect("/reference?tab=evidence");
}
