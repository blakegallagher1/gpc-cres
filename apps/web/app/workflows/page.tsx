import { redirect } from "next/navigation";

/** Legacy route — /workflows consolidated into /automation?tab=builder (2026 IA cleanup) */
export default function WorkflowsRedirect() {
  redirect("/automation?tab=builder");
}
