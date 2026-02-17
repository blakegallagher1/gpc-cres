import { redirect } from "next/navigation";

export default function SavedSearchesRedirect() {
  redirect("/prospecting?tab=saved-filters");
}
