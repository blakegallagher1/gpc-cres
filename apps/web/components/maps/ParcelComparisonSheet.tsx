"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MapParcel } from "./types";

interface ParcelComparisonSheetProps {
  open: boolean;
  parcels: MapParcel[];
  onClose: () => void;
}

export function ParcelComparisonSheet({ open, parcels, onClose }: ParcelComparisonSheetProps) {
  if (!open) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 p-3">
      <Card className="mx-auto max-w-7xl border-map-border bg-map-surface-overlay shadow-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm text-map-text-primary">
                Parcel Compare
              </CardTitle>
              <Badge variant="secondary" className="px-2 py-0.5 text-[9px]">
                {parcels.length} active
              </Badge>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onClose} className="text-xs">
              Close
            </Button>
          </div>
        </CardHeader>
        <Separator className="bg-map-border" />
        <CardContent className="pt-4">
          <ScrollArea className="max-h-[26rem]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead className="text-right">Acres</TableHead>
                  <TableHead>Zoning</TableHead>
                  <TableHead>Flood</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parcels.map((parcel) => (
                  <TableRow key={parcel.id}>
                    <TableCell className="font-medium text-map-text-primary">
                      {parcel.address}
                    </TableCell>
                    <TableCell className="text-map-text-muted">{parcel.id}</TableCell>
                    <TableCell className="text-right">
                      {parcel.acreage != null ? Number(parcel.acreage).toFixed(2) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="px-2 py-0.5 text-[9px]">
                        {parcel.currentZoning ?? "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>{parcel.floodZone ?? "-"}</TableCell>
                    <TableCell>{parcel.dealName ?? "-"}</TableCell>
                    <TableCell>{parcel.dealStatus ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
