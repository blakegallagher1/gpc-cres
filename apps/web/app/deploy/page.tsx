"use client";

import { useState } from "react";
import {
  FormInput,
  MessageSquare,
  Code,
  Hash,
  Phone,
  CheckCircle2,
  XCircle,
  Settings,
  Copy,
  BarChart3,
  Key,
  Eye,
  EyeOff,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface DeploymentChannel {
  id: string;
  channel: "form" | "chat" | "api" | "slack" | "whatsapp";
  name: string;
  description: string;
  isActive: boolean;
  config: Record<string, unknown>;
  stats?: {
    requests?: number;
    errors?: number;
    avgResponseTime?: number;
  };
}

const deploymentChannels: DeploymentChannel[] = [
  {
    id: "deploy_form",
    channel: "form",
    name: "Web Form",
    description: "Embed agents in web forms for user input",
    isActive: true,
    config: { forms: 3 },
    stats: { requests: 245, errors: 2, avgResponseTime: 1200 },
  },
  {
    id: "deploy_chat",
    channel: "chat",
    name: "Chat Widget",
    description: "Conversational interface for your website",
    isActive: true,
    config: { sites: 2 },
    stats: { requests: 892, errors: 5, avgResponseTime: 850 },
  },
  {
    id: "deploy_api",
    channel: "api",
    name: "REST API",
    description: "Direct API integration for your applications",
    isActive: true,
    config: { requests_per_day: 847 },
    stats: { requests: 847, errors: 1, avgResponseTime: 450 },
  },
  {
    id: "deploy_slack",
    channel: "slack",
    name: "Slack Bot",
    description: "Team collaboration via Slack",
    isActive: false,
    config: {},
  },
  {
    id: "deploy_whatsapp",
    channel: "whatsapp",
    name: "WhatsApp",
    description: "Mobile messaging via WhatsApp Business API",
    isActive: false,
    config: {},
  },
];

const apiKeys = [
  { id: "key_1", name: "Production API Key", key: "gpc_live_...xyz789", created: "2024-01-15", lastUsed: "2 hours ago" },
  { id: "key_2", name: "Development API Key", key: "gpc_test_...abc123", created: "2024-01-10", lastUsed: "1 day ago" },
];

function ChannelIcon({ channel }: { channel: string }) {
  const icons: Record<string, React.ElementType> = {
    form: FormInput,
    chat: MessageSquare,
    api: Code,
    slack: Hash,
    whatsapp: Phone,
  };
  const Icon = icons[channel] || FormInput;
  return <Icon className="h-6 w-6" />;
}

function ChannelCard({
  channel,
  onConfigure,
}: {
  channel: DeploymentChannel;
  onConfigure: (channel: DeploymentChannel) => void;
}) {
  return (
    <Card className={`transition-all ${channel.isActive ? "border-primary/50" : ""}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ChannelIcon channel={channel.channel} />
            </div>
            <div>
              <h3 className="font-semibold">{channel.name}</h3>
              <p className="text-sm text-muted-foreground">{channel.description}</p>
            </div>
          </div>
          <Badge
            variant={channel.isActive ? "default" : "secondary"}
            className={channel.isActive ? "bg-green-500/10 text-green-500" : ""}
          >
            {channel.isActive ? (
              <>
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Active
              </>
            ) : (
              <>
                <XCircle className="mr-1 h-3 w-3" />
                Inactive
              </>
            )}
          </Badge>
        </div>

        {channel.isActive && channel.stats && (
          <div className="mt-4 grid grid-cols-3 gap-4 rounded-lg bg-muted p-3">
            <div>
              <p className="text-xs text-muted-foreground">Requests</p>
              <p className="font-medium">{channel.stats.requests?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Errors</p>
              <p className="font-medium">{channel.stats.errors}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Response</p>
              <p className="font-medium">{channel.stats.avgResponseTime}ms</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            variant={channel.isActive ? "default" : "outline"}
            className="flex-1"
            onClick={() => onConfigure(channel)}
          >
            <Settings className="mr-2 h-4 w-4" />
            {channel.isActive ? "Configure" : "Set Up"}
          </Button>
          {channel.isActive && (
            <Button variant="outline">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DeployPage() {
  const [channels, setChannels] = useState<DeploymentChannel[]>(deploymentChannels);
  const [selectedChannel, setSelectedChannel] = useState<DeploymentChannel | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  const handleConfigure = (channel: DeploymentChannel) => {
    setSelectedChannel(channel);
    setConfigDialogOpen(true);
  };

  const handleToggleChannel = (channelId: string, isActive: boolean) => {
    setChannels(
      channels.map((c) =>
        c.id === channelId ? { ...c, isActive } : c
      )
    );
    toast.success(`${isActive ? "Enabled" : "Disabled"} ${channels.find((c) => c.id === channelId)?.name}`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Deployment Channels</h1>
          <p className="text-muted-foreground">
            Deploy agents across multiple touchpoints
          </p>
        </div>

        {/* Channel Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              onConfigure={handleConfigure}
            />
          ))}
        </div>

        {/* API Keys Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Keys
            </CardTitle>
            <CardDescription>
              Manage API keys for programmatic access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {apiKeys.map((apiKey) => (
                <div
                  key={apiKey.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{apiKey.name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <code className="rounded bg-muted px-1.5 py-0.5">
                        {showApiKey[apiKey.id] ? apiKey.key : apiKey.key.slice(0, 20) + "..."}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          setShowApiKey({
                            ...showApiKey,
                            [apiKey.id]: !showApiKey[apiKey.id],
                          })
                        }
                      >
                        {showApiKey[apiKey.id] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {apiKey.created} • Last used {apiKey.lastUsed}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(apiKey.key)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button className="mt-4" variant="outline">
              <Key className="mr-2 h-4 w-4" />
              Generate New API Key
            </Button>
          </CardContent>
        </Card>

        {/* Configuration Dialog */}
        <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedChannel?.isActive ? "Configure" : "Set Up"} {selectedChannel?.name}
              </DialogTitle>
              <DialogDescription>
                {selectedChannel?.isActive
                  ? "Update your deployment configuration"
                  : "Configure this deployment channel to get started"}
              </DialogDescription>
            </DialogHeader>

            {selectedChannel && (
              <Tabs defaultValue="general" className="mt-4">
                <TabsList>
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="embed">Embed Code</TabsTrigger>
                  {selectedChannel.channel === "api" && (
                    <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="general" className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Enable {selectedChannel.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Toggle this channel on or off
                      </p>
                    </div>
                    <Switch
                      checked={selectedChannel.isActive}
                      onCheckedChange={(checked) =>
                        handleToggleChannel(selectedChannel.id, checked)
                      }
                    />
                  </div>

                  {selectedChannel.channel === "form" && (
                    <div className="space-y-2">
                      <Label>Form Configuration</Label>
                      <Input placeholder="Form title" defaultValue="Property Analysis Request" />
                      <Input placeholder="Success message" defaultValue="Thank you! We'll analyze your request." />
                    </div>
                  )}

                  {selectedChannel.channel === "chat" && (
                    <div className="space-y-2">
                      <Label>Widget Configuration</Label>
                      <Input placeholder="Welcome message" defaultValue="Hi! How can I help you today?" />
                      <Input placeholder="Primary color" defaultValue="#3B82F6" />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="embed" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Embed Code</Label>
                    <div className="relative">
                      <pre className="rounded-lg bg-muted p-4 text-sm">
                        {selectedChannel.channel === "form" && `<script src="https://gpc.io/embed/form.js" data-agent="coordinator"></script>`}
                        {selectedChannel.channel === "chat" && `<script src="https://gpc.io/embed/chat.js" data-agent="coordinator"></script>`}
                        {selectedChannel.channel === "api" && `curl -X POST https://api.gpc.io/v1/run \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agent": "coordinator", "input": {"query": "..."}}'`}
                      </pre>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute right-2 top-2"
                        onClick={() =>
                          copyToClipboard(
                            selectedChannel.channel === "form"
                              ? `<script src="https://gpc.io/embed/form.js" data-agent="coordinator"></script>`
                              : selectedChannel.channel === "chat"
                              ? `<script src="https://gpc.io/embed/chat.js" data-agent="coordinator"></script>`
                              : `curl -X POST https://api.gpc.io/v1/run -H "Authorization: Bearer YOUR_API_KEY"`
                          )
                        }
                      >
                        <Copy className="mr-2 h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                {selectedChannel.channel === "api" && (
                  <TabsContent value="endpoints" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Available Endpoints</Label>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg border p-3">
                          <code className="text-sm">POST /v1/run</code>
                          <Badge>Run Agent</Badge>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border p-3">
                          <code className="text-sm">GET /v1/runs/:id</code>
                          <Badge>Get Run Status</Badge>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border p-3">
                          <code className="text-sm">GET /v1/runs/:id/trace</code>
                          <Badge>Get Run Trace</Badge>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
                Close
              </Button>
              <Button onClick={() => setConfigDialogOpen(false)}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
