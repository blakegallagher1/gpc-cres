import { redirect } from "next/navigation";

export default function BuyersRedirect() {
  redirect("/portfolio?tab=buyers");
}
