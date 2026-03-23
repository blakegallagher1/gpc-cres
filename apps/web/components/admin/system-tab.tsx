"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminTabNotice } from "@/components/admin/AdminTabNotice";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Database } from "lucide-react";

interface AdminTabError {
  message: string;
  detail?: string;
}

interface SystemData {
  tableCounts: Record<string, number>;
}

interface Props {
  data: SystemData | undefined;
  isLoading: boolean;
  error?: AdminTabError;
  onRetry: () => void;
}

export default function SystemTab({ data, isLoading, error, onRetry }: Props) {
  const hasData = Boolean(data);

  if (isLoading && !hasData) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 pt-4">
        {error ? <AdminTabNotice hasData={false} onRetry={onRetry} /> : null}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Database className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">System</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              System telemetry is not available yet. Retry to reload the latest table counts.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {error ? <AdminTabNotice hasData={true} onRetry={onRetry} /> : null}
      {/* Database Health */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Database className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Database</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead className="text-right">Row Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.tableCounts).map(([table, count]) => (
                <TableRow key={table}>
                  <TableCell className="font-mono text-sm">{table}</TableCell>
                  <TableCell className="text-right font-medium">
                    {count.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
