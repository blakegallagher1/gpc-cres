import { redirect } from "next/navigation";

/** Legacy route — /evidence consolidated into /reference?tab=evidence (2026 IA cleanup) */
export default function EvidenceRedirect() {
  redirect("/reference?tab=evidence");
}
