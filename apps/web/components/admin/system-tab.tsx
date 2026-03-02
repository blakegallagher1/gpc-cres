"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Database, Server } from "lucide-react";

interface SystemData {
  tableCounts: Record<string, number>;
}

interface Props {
  data: SystemData | undefined;
  isLoading: boolean;
}

export default function SystemTab({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
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
