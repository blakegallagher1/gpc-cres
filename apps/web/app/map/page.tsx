import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { MapPageClient } from "./MapPageClient";

export default function MapPage() {
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
