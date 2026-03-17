import { redirect } from "next/navigation";

/** Legacy route — /buyers consolidated into /portfolio?tab=buyers (2026 IA cleanup) */
export default function BuyersRedirect() {
  redirect("/portfolio?tab=buyers");
}
