"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BACKEND_URL_ERROR_MESSAGE, getBackendBaseUrl } from "@/lib/backendConfig";
import { supabase } from "@/lib/db/supabase";
import { toast } from "sonner";

type IntakeFormState = {
  name: string;
  address: string;
  broker: string;
  askingPrice: string;
  propertyType: string;
  squareFeet: string;
  source: string;
  contact: string;
  notes: string;
};

export default function ScreeningIntakePage() {
  const router = useRouter();
  const [form, setForm] = useState<IntakeFormState>({
    name: "",
    address: "",
    broker: "",
    askingPrice: "",
    propertyType: "",
    squareFeet: "",
    source: "",
    contact: "",
    notes: "",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []);
    setFiles(nextFiles);
  };

const handleSubmit = async (event: FormEvent) => {
  event.preventDefault();
  if (!form.address.trim() || !form.broker.trim() || !form.propertyType.trim()) {
    toast.error("Address, broker, and property type are required.");
    return;
  }

  const backendUrl = getBackendBaseUrl();
  if (!backendUrl) {
    toast.error(BACKEND_URL_ERROR_MESSAGE);
    return;
  }

  setSubmitting(true);
  try {
      const documents = [];
      for (const file of files) {
        const storagePath = `screening/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("deal-room-uploads")
          .upload(storagePath, file, { upsert: true });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrl } = supabase.storage
          .from("deal-room-uploads")
          .getPublicUrl(storagePath);

        documents.push({
          file_name: file.name,
          document_type: "offering_memo",
          storage_path: storagePath,
          storage_url: publicUrl.publicUrl,
          mime_type: file.type,
        });
      }

      const response = await fetch(`${backendUrl}/screening/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || undefined,
          address: form.address,
          broker: form.broker,
          asking_price: form.askingPrice ? Number(form.askingPrice) : undefined,
          property_type: form.propertyType,
          square_feet: form.squareFeet ? Number(form.squareFeet) : undefined,
          source: form.source || undefined,
          contact: form.contact || undefined,
          documents,
          metadata: form.notes ? { notes: form.notes } : {},
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to intake screening deal");
      }

      const payload = (await response.json()) as { project?: { id?: string } };
      const projectId = payload.project?.id;
      toast.success("Screening intake created");
      if (projectId) {
        router.push(`/screening/${projectId}`);
      }
    } catch (error) {
      console.error("Failed to intake screening deal:", error);
      toast.error("Failed to create screening intake");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">New Screening Intake</h1>
          <p className="text-sm text-muted-foreground">
            Upload the OM and model, then capture the headline details for screening.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deal Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name (optional)</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Industrial Portfolio - Baton Rouge"
                />
              </div>
              <div className="space-y-2">
                <Label>Address *</Label>
                <Input
                  value={form.address}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                  placeholder="1234 Industrial Pkwy, Baton Rouge, LA"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Broker *</Label>
                <Input
                  value={form.broker}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, broker: event.target.value }))
                  }
                  placeholder="Broker name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Asking Price</Label>
                <Input
                  value={form.askingPrice}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, askingPrice: event.target.value }))
                  }
                  placeholder="12000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Property Type *</Label>
                <Input
                  value={form.propertyType}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, propertyType: event.target.value }))
                  }
                  placeholder="Industrial"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Square Feet</Label>
                <Input
                  value={form.squareFeet}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, squareFeet: event.target.value }))
                  }
                  placeholder="150000"
                />
              </div>
              <div className="space-y-2">
                <Label>Source</Label>
                <Input
                  value={form.source}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, source: event.target.value }))
                  }
                  placeholder="Newmark blast"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact</Label>
                <Input
                  value={form.contact}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, contact: event.target.value }))
                  }
                  placeholder="contact@broker.com"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  placeholder="Any quick context to help the screening run."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Label className="text-sm text-muted-foreground">
                Upload the OM PDF and any Excel model (optional).
              </Label>
              <Input
                type="file"
                multiple
                onChange={handleFileChange}
                accept=".pdf,.xlsx,.xls,.csv"
              />
              {files.length > 0 && (
                <div className="space-y-2 text-sm text-muted-foreground">
                  {files.map((file) => (
                    <div key={file.name} className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {file.name}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="gap-2" disabled={submitting}>
              <UploadCloud className="h-4 w-4" />
              {submitting ? "Submitting..." : "Create Screening"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/screening")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}
