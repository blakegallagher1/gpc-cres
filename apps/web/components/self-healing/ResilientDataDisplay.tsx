"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type ResilientResult<TData> = {
  success: boolean;
  data?: TData;
  fallbackUsed: boolean;
  warnings: string[];
  error?: { message?: string } | null;
};

type ResilientDataDisplayProps<TData> = {
  fetcher: () => Promise<ResilientResult<TData>>;
  children: (data: TData) => ReactNode;
  fallbackComponent?: ReactNode;
};

export function ResilientDataDisplay<TData>({
  fetcher,
  children,
  fallbackComponent,
}: ResilientDataDisplayProps<TData>) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ResilientResult<TData> | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetcher();
      setResult(response);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <div className="h-24 animate-pulse rounded-md bg-muted" />;
  }

  if (!result) return null;

  return (
    <div className="space-y-3">
      {(result.fallbackUsed || result.warnings.length > 0) && (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary">Degraded mode</Badge>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {result.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
              Retry primary source
            </Button>
          </CardContent>
        </Card>
      )}

      {result.success && result.data && children(result.data)}

      {!result.success && fallbackComponent && (
        <Card>
          <CardContent className="pt-4">
            <p className="mb-2 text-sm font-medium">Primary data unavailable</p>
            {fallbackComponent}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
