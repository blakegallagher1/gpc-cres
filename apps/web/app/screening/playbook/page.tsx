import { redirect } from "next/navigation";

/** Legacy route — /screening/playbook consolidated into /deals/playbook (2026 IA cleanup) */
export default function ScreeningPlaybookRedirect() {
  redirect("/deals/playbook");
}
