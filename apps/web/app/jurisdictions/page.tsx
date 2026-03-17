import { redirect } from "next/navigation";

/** Legacy route — /jurisdictions consolidated into /reference?tab=jurisdictions (2026 IA cleanup) */
export default function JurisdictionsRedirect() {
  redirect("/reference?tab=jurisdictions");
}
