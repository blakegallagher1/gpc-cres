"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { DealUpsertForm } from "@/components/deals/DealUpsertForm";

export default function NewDealPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="mx-auto max-w-2xl p-8 text-center text-muted-foreground">
            Loading...
          </div>
        </DashboardShell>
      }
    >
      <NewDealForm />
    </Suspense>
  );
}

function NewDealForm() {
  const searchParams = useSearchParams();
  return (
    <DealUpsertForm
      mode="create"
      prefillAddress={searchParams.get("address") ?? ""}
      prefillParish={searchParams.get("parish") ?? ""}
    />
  );
}
