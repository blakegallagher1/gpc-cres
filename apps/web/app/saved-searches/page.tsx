import { redirect } from "next/navigation";

/** Legacy route — /saved-searches consolidated into /prospecting?tab=saved-filters (2026 IA cleanup) */
export default function SavedSearchesRedirect() {
  redirect("/prospecting?tab=saved-filters");
}
