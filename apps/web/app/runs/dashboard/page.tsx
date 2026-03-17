import { redirect } from "next/navigation";

/** Legacy route — /runs/dashboard consolidated into /runs?tab=intelligence (2026 IA cleanup) */
export default function RunsDashboardRedirect() {
  redirect("/runs?tab=intelligence");
}
