import { redirect } from "next/navigation";

/** Legacy route — /screening consolidated into /deals?view=triage (2026 IA cleanup) */
export default function ScreeningRedirect() {
  redirect("/deals?view=triage");
}
