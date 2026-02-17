import { redirect } from "next/navigation";

export default function JurisdictionsRedirect() {
  redirect("/reference?tab=jurisdictions");
}
