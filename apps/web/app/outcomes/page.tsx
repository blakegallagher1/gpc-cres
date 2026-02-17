import { redirect } from "next/navigation";

export default function OutcomesRedirect() {
  redirect("/portfolio?tab=outcomes");
}
