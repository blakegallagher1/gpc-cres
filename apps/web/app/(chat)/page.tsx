import type { Metadata } from "next";
import { CompanyHomePage } from "@/components/marketing/CompanyHomePage";

export const metadata: Metadata = {
  title: "Gallagher Property Company | Basis, Approvals, Control",
  description:
    "Gallagher Property Company buys, entitles, builds, and operates manufactured housing communities with parcel truth, approval sequence, and operating memory in one working chain.",
};

export default function HomePage() {
  return <CompanyHomePage />;
}
