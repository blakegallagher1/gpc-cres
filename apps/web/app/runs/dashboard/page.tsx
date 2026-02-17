import { redirect } from "next/navigation";

export default function RunsDashboardRedirect() {
  redirect("/runs?tab=intelligence");
}
