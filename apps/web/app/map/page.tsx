import { Suspense } from "react";
import { connection } from "next/server";
import { Loader2 } from "lucide-react";
import { MapPageClient } from "./MapPageClient";

export default async function MapPage() {
  await connection();

  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-lg border bg-muted">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <MapPageClient />
    </Suspense>
  );
}
