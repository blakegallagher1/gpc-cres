import type { Metadata } from "next";
import { CompanyHomePage } from "@/components/marketing/CompanyHomePage";

export const metadata: Metadata = {
  title: "Gallagher Property Company | Development, Investment, and Entitlement Discipline",
  description:
    "Gallagher Property Company is a Baton Rouge-based commercial real estate development and investment company operating with site intelligence, entitlement rigor, and capital discipline.",
};

export default function HomePage() {
  return <CompanyHomePage />;
}
