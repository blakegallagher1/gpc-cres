import type { Metadata } from "next";
import { CompanyHomePage } from "@/components/marketing/CompanyHomePage";

export const metadata: Metadata = {
  title: "Gallagher Property Company | Buy, Build, Sell",
  description:
    "Gallagher Property Company buys, builds, and sells commercial real estate with direct underwriting and disciplined execution.",
};

export default function HomePage() {
  return <CompanyHomePage />;
}
