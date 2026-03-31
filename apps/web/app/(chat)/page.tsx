import type { Metadata } from "next";
import { CompanyHomePage } from "@/components/marketing/CompanyHomePage";

export const metadata: Metadata = {
  title: "Gallagher Property Company | Functional Real Estate",
  description:
    "Gallagher Property Company acquires, builds, and manages manufactured housing communities and small-format industrial assets with basis discipline, approval control, and a real operating platform behind the work.",
};

export default function HomePage() {
  return <CompanyHomePage />;
}
