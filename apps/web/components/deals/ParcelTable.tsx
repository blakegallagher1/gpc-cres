"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ParcelItem {
  id: string;
  address: string;
  apn?: string | null;
  acreage?: string | number | null;
  currentZoning?: string | null;
  futureLandUse?: string | null;
}

interface ParcelTableProps {
  parcels: ParcelItem[];
}

export function ParcelTable({ parcels }: ParcelTableProps) {
  if (parcels.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No parcels added yet. Add a parcel to get started.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead>APN</TableHead>
          <TableHead>Zoning</TableHead>
          <TableHead>Future Land Use</TableHead>
          <TableHead className="text-right">Acreage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {parcels.map((parcel) => (
          <TableRow key={parcel.id}>
            <TableCell className="font-medium">{parcel.address}</TableCell>
            <TableCell>{parcel.apn ?? "--"}</TableCell>
            <TableCell>{parcel.currentZoning ?? "--"}</TableCell>
            <TableCell>{parcel.futureLandUse ?? "--"}</TableCell>
            <TableCell className="text-right">
              {parcel.acreage != null ? Number(parcel.acreage).toFixed(2) : "--"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
