"use client";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SkuBadge } from "@/components/deals/SkuBadge";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { GuidedOnboardingPanel } from "@/components/onboarding/GuidedOnboardingPanel";

const BUYER_TYPES = [
  { value: "operator", label: "Operator" },
  { value: "developer", label: "Developer" },
  { value: "investor", label: "Investor" },
  { value: "broker", label: "Broker" },
];

const SKU_OPTIONS = [
  { value: "SMALL_BAY_FLEX", label: "Small Bay Flex" },
  { value: "OUTDOOR_STORAGE", label: "Outdoor Storage" },
  { value: "TRUCK_PARKING", label: "Truck Parking" },
];

const BUYER_SAMPLE_PROFILES = [
  {
    name: "Avery Chen",
    company: "Baton Rouge Industrial Holdings",
    email: "avery@brindustrial.com",
    phone: "(225) 555-1122",
    buyerType: "operator",
    skuInterests: ["SMALL_BAY_FLEX", "TRUCK_PARKING"],
  },
  {
    name: "Noah Patel",
    company: "Gulf State Logistics Partners",
    email: "noah@gulfstate-logistics.com",
    phone: "(225) 555-3344",
    buyerType: "investor",
    skuInterests: ["OUTDOOR_STORAGE", "SMALL_BAY_FLEX"],
  },
];

interface BuyerItem {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  buyerType: string;
  skuInterests: string[];
  notes?: string | null;
}

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<BuyerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New buyer form
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState("");
  const [newSkuInterests, setNewSkuInterests] = useState<string[]>([]);

  const loadBuyers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (typeFilter !== "all") params.set("buyerType", typeFilter);

      const res = await fetch(`/api/buyers?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load buyers");
      const data = await res.json();
      setBuyers(data.buyers ?? []);
    } catch (error) {
      console.error("Failed to load buyers:", error);
      toast.error("Failed to load buyers");
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    loadBuyers();
  }, [loadBuyers]);

  const toggleSkuInterest = (sku: string) => {
    setNewSkuInterests((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]
    );
  };

  const applyBuyerTemplate = (template: (typeof BUYER_SAMPLE_PROFILES)[number]) => {
    setDialogOpen(true);
    setNewName(template.name);
    setNewCompany(template.company);
    setNewEmail(template.email);
    setNewPhone(template.phone);
    setNewType(template.buyerType);
    setNewSkuInterests(template.skuInterests);
  };

  const handleAddBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newType) {
      toast.error("Name and type are required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/buyers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          company: newCompany.trim() || undefined,
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          buyerType: newType,
          skuInterests: newSkuInterests,
        }),
      });
      if (!res.ok) throw new Error("Failed to create buyer");
      toast.success("Buyer added");
      setDialogOpen(false);
      setNewName("");
      setNewCompany("");
      setNewEmail("");
      setNewPhone("");
      setNewType("");
      setNewSkuInterests([]);
      loadBuyers();
    } catch (error) {
      console.error("Failed to create buyer:", error);
      toast.error("Failed to create buyer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Buyers</h1>
            <p className="text-sm text-muted-foreground">
              Buyer database for exit marketing and outreach.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Buyer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Buyer</DialogTitle>
                <DialogDescription>
                  Add a new buyer contact to the database.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddBuyer} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name *</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Contact name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company</label>
                  <Input
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="Company name"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type *</label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select buyer type" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUYER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">SKU Interests</label>
                  <div className="flex flex-wrap gap-2">
                    {SKU_OPTIONS.map((o) => (
                      <Badge
                        key={o.value}
                        variant={newSkuInterests.includes(o.value) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleSkuInterest(o.value)}
                      >
                        {o.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting} className="gap-2">
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Add Buyer
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {BUYER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search buyers..."
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Loading buyers...
            </CardContent>
          </Card>
        ) : buyers.length === 0 ? (
          <GuidedOnboardingPanel
            icon={<Users className="h-4 w-4" />}
            title="No buyers yet"
            description="Build your buyer list to unlock smarter matching and outreach."
            steps={[
              {
                title: "Add your first buyer",
                description:
                  "Capture name, company, and preferred SKU types so deal routing can be customized immediately.",
              },
              {
                title: "Record contact preferences",
                description:
                  "Use the tags and notes fields to prioritize the best outreach strategy.",
              },
              {
                title: "Use this data during screening",
                description:
                  "As you evaluate deals, match the best-fit buyers and keep your CRM workflow moving.",
              },
            ]}
            primaryActions={[
              {
                label: "Add your first buyer",
                icon: <Plus className="h-3.5 w-3.5" />,
                onClick: () => setDialogOpen(true),
              },
            ]}
            sampleActions={BUYER_SAMPLE_PROFILES.map((profile) => ({
              name: profile.name,
              description: `${profile.company} • ${profile.buyerType}`,
              actionLabel: "Load sample profile",
              action: {
                label: "Load sample profile",
                icon: <Users className="h-3.5 w-3.5" />,
                onClick: () => applyBuyerTemplate(profile),
              },
            }))}
          />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SKU Interests</TableHead>
                  <TableHead>Contact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buyers.map((buyer) => (
                  <TableRow key={buyer.id}>
                    <TableCell className="font-medium">{buyer.name}</TableCell>
                    <TableCell>{buyer.company ?? "--"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {buyer.buyerType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {buyer.skuInterests.length > 0
                          ? buyer.skuInterests.map((s) => (
                              <SkuBadge key={s} sku={s} />
                            ))
                          : "--"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {buyer.email || buyer.phone || "--"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
