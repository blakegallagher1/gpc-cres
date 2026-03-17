import { redirect } from "next/navigation";

/** Legacy route — /outcomes consolidated into /portfolio?tab=outcomes (2026 IA cleanup) */
export default function OutcomesRedirect() {
  redirect("/portfolio?tab=outcomes");
}
