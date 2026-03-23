"use client";

import { redirect } from "next/navigation";

export default function ProspectingPage() {
  redirect("/map?mode=prospecting");
}
