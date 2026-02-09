"use client";

import { useState, useEffect } from "react";
import { Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const CONTACTS_START = "---CONTACTS---\n";
const CONTACTS_END = "\n---END_CONTACTS---";

interface Contacts {
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  brokerName: string;
  brokerPhone: string;
  brokerEmail: string;
}

const emptyContacts: Contacts = {
  sellerName: "",
  sellerPhone: "",
  sellerEmail: "",
  brokerName: "",
  brokerPhone: "",
  brokerEmail: "",
};

function parseContacts(notes: string | null): { contacts: Contacts; plainNotes: string } {
  if (!notes) return { contacts: emptyContacts, plainNotes: "" };

  const startIdx = notes.indexOf(CONTACTS_START);
  const endIdx = notes.indexOf(CONTACTS_END);

  if (startIdx === -1 || endIdx === -1) {
    return { contacts: emptyContacts, plainNotes: notes };
  }

  const jsonStr = notes.slice(startIdx + CONTACTS_START.length, endIdx);
  const plainNotes = (notes.slice(0, startIdx) + notes.slice(endIdx + CONTACTS_END.length)).trim();

  try {
    const parsed = JSON.parse(jsonStr) as Partial<Contacts>;
    return {
      contacts: { ...emptyContacts, ...parsed },
      plainNotes,
    };
  } catch {
    return { contacts: emptyContacts, plainNotes: notes };
  }
}

function serializeContacts(contacts: Contacts, plainNotes: string): string {
  const hasData = Object.values(contacts).some((v) => v.trim());
  if (!hasData) return plainNotes;
  return `${CONTACTS_START}${JSON.stringify(contacts)}${CONTACTS_END}${plainNotes ? "\n" + plainNotes : ""}`;
}

interface DealContactsProps {
  dealId: string;
  notes: string | null;
}

export function DealContacts({ dealId, notes }: DealContactsProps) {
  const { contacts: initial, plainNotes } = parseContacts(notes);
  const [contacts, setContacts] = useState<Contacts>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { contacts: parsed } = parseContacts(notes);
    setContacts(parsed);
  }, [notes]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const newNotes = serializeContacts(contacts, plainNotes);
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: newNotes }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditing(false);
      toast.success("Contacts saved");
    } catch (error) {
      console.error("Save contacts error:", error);
      toast.error("Failed to save contacts");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    const { contacts: parsed } = parseContacts(notes);
    setContacts(parsed);
    setEditing(false);
  };

  const update = (field: keyof Contacts, value: string) => {
    setContacts((prev) => ({ ...prev, [field]: value }));
  };

  const hasData = Object.values(contacts).some((v) => v.trim());

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Contacts</CardTitle>
        {editing ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Seller</p>
              <Input placeholder="Name" value={contacts.sellerName} onChange={(e) => update("sellerName", e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Phone" value={contacts.sellerPhone} onChange={(e) => update("sellerPhone", e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Email" value={contacts.sellerEmail} onChange={(e) => update("sellerEmail", e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Broker</p>
              <Input placeholder="Name" value={contacts.brokerName} onChange={(e) => update("brokerName", e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Phone" value={contacts.brokerPhone} onChange={(e) => update("brokerPhone", e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Email" value={contacts.brokerEmail} onChange={(e) => update("brokerEmail", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
        ) : hasData ? (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {contacts.sellerName && (
              <div>
                <p className="text-xs text-muted-foreground">Seller</p>
                <p className="font-medium">{contacts.sellerName}</p>
                {contacts.sellerPhone && <p className="text-xs text-muted-foreground">{contacts.sellerPhone}</p>}
                {contacts.sellerEmail && <p className="text-xs text-muted-foreground">{contacts.sellerEmail}</p>}
              </div>
            )}
            {contacts.brokerName && (
              <div>
                <p className="text-xs text-muted-foreground">Broker</p>
                <p className="font-medium">{contacts.brokerName}</p>
                {contacts.brokerPhone && <p className="text-xs text-muted-foreground">{contacts.brokerPhone}</p>}
                {contacts.brokerEmail && <p className="text-xs text-muted-foreground">{contacts.brokerEmail}</p>}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No contacts added. Click edit to add.</p>
        )}
      </CardContent>
    </Card>
  );
}
