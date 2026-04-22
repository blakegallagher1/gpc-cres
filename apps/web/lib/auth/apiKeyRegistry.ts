export type ApiKeyStorageClass =
  | "publishable"
  | "ephemeral"
  | "secret"
  | "webhook"
  | "internal";

export type ApiKeyPrincipalType =
  | "browser"
  | "user_session"
  | "service_account"
  | "admin_operator"
  | "webhook_sender"
  | "worker_runtime";

export type EndpointAuthMode =
  | "public"
  | "publishable_exchange"
  | "session"
  | "session_or_ephemeral"
  | "service"
  | "service_or_session"
  | "admin"
  | "webhook"
  | "internal_only";

export type ApiKeyScope =
  | "token.exchange"
  | "agent.auth.resolve"
  | "agent.chat.execute"
  | "agent.run.read"
  | "agent.tools.execute"
  | "agent.memory.bridge"
  | "deals.read"
  | "deals.write"
  | "deals.tasks.write"
  | "opportunities.read"
  | "opportunities.write"
  | "workflows.read"
  | "workflows.write"
  | "approvals.read"
  | "approvals.write"
  | "runs.read"
  | "outcomes.read"
  | "outcomes.write"
  | "assets.read"
  | "assets.write"
  | "evidence.read"
  | "evidence.write"
  | "artifacts.read"
  | "artifacts.write"
  | "parcels.read"
  | "parcel_sets.read"
  | "parcel_sets.write"
  | "geofences.read"
  | "geofences.write"
  | "map.read"
  | "map.write"
  | "map.tiles.read"
  | "places.read"
  | "market.read"
  | "intelligence.read"
  | "knowledge.read"
  | "knowledge.write"
  | "entities.read"
  | "entities.write"
  | "memory.read"
  | "memory.write"
  | "memory.feedback.write"
  | "agent_learning.read"
  | "portfolio.read"
  | "portfolio.write"
  | "wealth.read"
  | "preferences.read"
  | "preferences.write"
  | "notifications.read"
  | "notifications.write"
  | "saved_searches.read"
  | "saved_searches.write"
  | "buyers.read"
  | "buyers.write"
  | "search.read"
  | "proactive.read"
  | "proactive.write"
  | "public.forms.submit"
  | "health.read"
  | "observability.read"
  | "observability.write"
  | "automation.events.read"
  | "automation.events.write"
  | "cron.invoke"
  | "admin.read"
  | "admin.write"
  | "admin.deploy"
  | "admin.observability.read"
  | "webhook.sentinel.ingest";

export interface ApiKeyDefinition {
  keyId: string;
  displayName: string;
  prefix: string;
  storageClass: ApiKeyStorageClass;
  principal: ApiKeyPrincipalType;
  envVar: string;
  ttlSeconds: number | null;
  browserSafe: boolean;
  orgScoped: boolean;
  scopes: readonly ApiKeyScope[];
  notes: string;
}

export interface EndpointScopeRule {
  routePattern: string;
  authMode: EndpointAuthMode;
  scopes: readonly ApiKeyScope[];
  browserCallable: boolean;
  exposeExternally: boolean;
  frontendCredentialSource:
    | "none"
    | "session_cookie"
    | "publishable_key_exchange"
    | "ephemeral_bearer"
    | "never_browser";
  notes: string;
}

export const API_KEY_REGISTRY = [
  {
    keyId: "public_publishable_key",
    displayName: "Public Publishable Key",
    prefix: "gpc_pk_",
    storageClass: "publishable",
    principal: "browser",
    envVar: "NEXT_PUBLIC_GPC_PUBLISHABLE_KEY",
    ttlSeconds: null,
    browserSafe: true,
    orgScoped: false,
    scopes: ["token.exchange"],
    notes:
      "Used only to identify a public client and exchange for a short-lived ephemeral token. Never authorizes core business endpoints directly.",
  },
  {
    keyId: "ephemeral_client_token",
    displayName: "Ephemeral Client Token",
    prefix: "gpc_et_",
    storageClass: "ephemeral",
    principal: "browser",
    envVar: "issued_at_runtime",
    ttlSeconds: 900,
    browserSafe: true,
    orgScoped: true,
    scopes: [
      "agent.auth.resolve",
      "agent.chat.execute",
      "agent.run.read",
      "deals.read",
      "deals.write",
      "opportunities.read",
      "opportunities.write",
      "workflows.read",
      "workflows.write",
      "approvals.read",
      "approvals.write",
      "runs.read",
      "outcomes.read",
      "outcomes.write",
      "assets.read",
      "assets.write",
      "evidence.read",
      "artifacts.read",
      "parcels.read",
      "parcel_sets.read",
      "parcel_sets.write",
      "geofences.read",
      "geofences.write",
      "map.read",
      "map.write",
      "map.tiles.read",
      "places.read",
      "market.read",
      "intelligence.read",
      "knowledge.read",
      "entities.read",
      "entities.write",
      "memory.read",
      "memory.write",
      "memory.feedback.write",
      "agent_learning.read",
      "portfolio.read",
      "wealth.read",
      "preferences.read",
      "preferences.write",
      "notifications.read",
      "notifications.write",
      "saved_searches.read",
      "saved_searches.write",
      "buyers.read",
      "buyers.write",
      "search.read",
      "proactive.read",
      "proactive.write",
      "observability.write",
    ],
    notes:
      "Short-lived JWT minted by the app for browser or embedded clients. Carries org/user identity plus a reduced scope set.",
  },
  {
    keyId: "gateway_service_key",
    displayName: "Gateway Service Key",
    prefix: "gpc_sk_gw_",
    storageClass: "secret",
    principal: "service_account",
    envVar: "GPC_GATEWAY_SERVICE_KEY",
    ttlSeconds: null,
    browserSafe: false,
    orgScoped: false,
    scopes: [
      "parcels.read",
      "map.read",
      "map.tiles.read",
      "places.read",
      "market.read",
      "intelligence.read",
      "evidence.read",
    ],
    notes:
      "Server-to-server key for Next.js routes that proxy into the private FastAPI/property gateway. Replaces generic reuse of LOCAL_API_KEY.",
  },
  {
    keyId: "coordinator_service_key",
    displayName: "Coordinator Service Key",
    prefix: "gpc_sk_coord_",
    storageClass: "internal",
    principal: "worker_runtime",
    envVar: "GPC_COORDINATOR_SERVICE_KEY",
    ttlSeconds: null,
    browserSafe: false,
    orgScoped: false,
    scopes: [
      "agent.auth.resolve",
      "agent.chat.execute",
      "agent.tools.execute",
      "agent.memory.bridge",
      "memory.read",
      "memory.write",
      "memory.feedback.write",
      "runs.read",
    ],
    notes:
      "Used by internal worker and coordinator runtimes when calling back into app routes with forwarded org/user headers.",
  },
  {
    keyId: "memory_service_key",
    displayName: "Memory Service Key",
    prefix: "gpc_sk_mem_",
    storageClass: "secret",
    principal: "service_account",
    envVar: "GPC_MEMORY_SERVICE_KEY",
    ttlSeconds: null,
    browserSafe: false,
    orgScoped: false,
    scopes: [
      "agent.memory.bridge",
      "memory.read",
      "memory.write",
      "memory.feedback.write",
      "knowledge.write",
      "agent_learning.read",
    ],
    notes:
      "Background ingestion and memory synchronization key. Intended for trusted back-office jobs only.",
  },
  {
    keyId: "admin_control_key",
    displayName: "Admin Control Key",
    prefix: "gpc_ik_admin_",
    storageClass: "internal",
    principal: "admin_operator",
    envVar: "GPC_ADMIN_CONTROL_KEY",
    ttlSeconds: null,
    browserSafe: false,
    orgScoped: false,
    scopes: [
      "admin.read",
      "admin.write",
      "admin.deploy",
      "admin.observability.read",
      "health.read",
      "observability.read",
      "automation.events.read",
    ],
    notes:
      "Separate control-plane key for admin APIs and private infrastructure operations. Never usable from the browser.",
  },
  {
    keyId: "webhook_ingest_key",
    displayName: "Webhook Ingest Key",
    prefix: "gpc_wh_",
    storageClass: "webhook",
    principal: "webhook_sender",
    envVar: "GPC_WEBHOOK_INGEST_KEY",
    ttlSeconds: null,
    browserSafe: false,
    orgScoped: false,
    scopes: ["webhook.sentinel.ingest", "automation.events.write", "cron.invoke"],
    notes:
      "One-per-sender webhook secret for sentinel, cron, or third-party machine callbacks. Keep these single-purpose and independently rotatable.",
  },
] as const satisfies readonly ApiKeyDefinition[];

export const API_ENDPOINT_SCOPE_MATRIX = [
  {
    routePattern: "/api/auth/token",
    authMode: "session",
    scopes: ["token.exchange"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Current browser token-minting endpoint for the Cloudflare worker/WebSocket path.",
  },
  {
    routePattern: "/api/agent/auth/resolve",
    authMode: "session_or_ephemeral",
    scopes: ["agent.auth.resolve"],
    browserCallable: false,
    exposeExternally: true,
    frontendCredentialSource: "ephemeral_bearer",
    notes: "Worker-facing identity resolution endpoint. Allow session only for same-origin app flows.",
  },
  {
    routePattern: "/api/chat",
    authMode: "session_or_ephemeral",
    scopes: ["agent.chat.execute"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Primary orchestrated AI entry point. Keep gateway and tool credentials server-held.",
  },
  {
    routePattern: "/api/chat/**",
    authMode: "session_or_ephemeral",
    scopes: ["agent.chat.execute", "agent.run.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes:
      "Chat subroutes for conversation history, tool approvals, and resume flows. Keep them on the same auth contract as the primary chat route.",
  },
  {
    routePattern: "/api/agent",
    authMode: "session_or_ephemeral",
    scopes: ["agent.chat.execute"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Alternate SSE-based agent run entry point.",
  },
  {
    routePattern: "/api/agent/tools/execute",
    authMode: "service_or_session",
    scopes: ["agent.tools.execute"],
    browserCallable: true,
    exposeExternally: false,
    frontendCredentialSource: "session_cookie",
    notes:
      "Internal tool dispatch surface for trusted workers and same-origin operator flows. Never expose directly to third-party browsers.",
  },
  {
    routePattern: "/api/deals/**",
    authMode: "service_or_session",
    scopes: [
      "deals.read",
      "deals.write",
      "deals.tasks.write",
      "artifacts.read",
      "artifacts.write",
      "evidence.read",
      "evidence.write",
      "assets.read",
      "assets.write",
      "outcomes.read",
      "outcomes.write",
    ],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Tenant-private deal platform APIs. External service accounts may be allowed selectively.",
  },
  {
    routePattern: "/api/opportunities/**",
    authMode: "service_or_session",
    scopes: ["opportunities.read", "opportunities.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Opportunity OS endpoints should stay org-scoped.",
  },
  {
    routePattern: "/api/workflows/**",
    authMode: "service_or_session",
    scopes: ["workflows.read", "workflows.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Workflow templates and stage orchestration.",
  },
  {
    routePattern: "/api/approvals",
    authMode: "service_or_session",
    scopes: ["approvals.read", "approvals.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Operator approval workflows.",
  },
  {
    routePattern: "/api/runs/**",
    authMode: "service_or_session",
    scopes: ["runs.read", "agent.run.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Run listings, run detail, and trace-style read paths.",
  },
  {
    routePattern: "/api/outcomes/**",
    authMode: "service_or_session",
    scopes: ["outcomes.read", "outcomes.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Outcome recording and retrieval.",
  },
  {
    routePattern: "/api/parcels/**",
    authMode: "service_or_session",
    scopes: ["parcels.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "User-facing parcel search/detail APIs that proxy into the private gateway.",
  },
  {
    routePattern: "/api/parcel-sets/**",
    authMode: "service_or_session",
    scopes: ["parcel_sets.read", "parcel_sets.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Saved parcel collections and map planning sets.",
  },
  {
    routePattern: "/api/geofences/**",
    authMode: "service_or_session",
    scopes: ["geofences.read", "geofences.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "User-managed geospatial boundaries.",
  },
  {
    routePattern: "/api/map/**",
    authMode: "service_or_session",
    scopes: ["map.read", "map.write", "map.tiles.read", "parcels.read", "market.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Expose only the Next.js façade routes. Do not expose the FastAPI gateway directly.",
  },
  {
    routePattern: "/api/places/autocomplete",
    authMode: "service_or_session",
    scopes: ["places.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Autocomplete should stay server-mediated because it fans out to Google and parcel DB providers.",
  },
  {
    routePattern: "/api/market/**",
    authMode: "service_or_session",
    scopes: ["market.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Market and permit intelligence reads.",
  },
  {
    routePattern: "/api/intelligence/**",
    authMode: "service_or_session",
    scopes: ["intelligence.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Deadlines, daily briefing, and entitlement intelligence reads.",
  },
  {
    routePattern: "/api/search",
    authMode: "service_or_session",
    scopes: ["search.read", "deals.read", "parcels.read", "knowledge.read", "runs.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Unified search surface across internal domains.",
  },
  {
    routePattern: "/api/entities/**",
    authMode: "service_or_session",
    scopes: ["entities.read", "entities.write", "memory.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Entity truth, memory, lookup, and related graph retrieval.",
  },
  {
    routePattern: "/api/knowledge",
    authMode: "service_or_session",
    scopes: ["knowledge.read", "knowledge.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Knowledge base reads are safe for users; writes should stay tightly scoped.",
  },
  {
    routePattern: "/api/memory/**",
    authMode: "service_or_session",
    scopes: ["memory.read", "memory.write", "memory.feedback.write", "agent.memory.bridge"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Keep write paths behind authenticated org identity or trusted service accounts only.",
  },
  {
    routePattern: "/api/agent-learning/**",
    authMode: "service_or_session",
    scopes: ["agent_learning.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Read-mostly operator and analytics endpoints.",
  },
  {
    routePattern: "/api/portfolio/**",
    authMode: "service_or_session",
    scopes: ["portfolio.read", "portfolio.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Portfolio analytics and optimization should require org-scoped auth.",
  },
  {
    routePattern: "/api/wealth/**",
    authMode: "service_or_session",
    scopes: ["wealth.read"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Wealth and tax-event summaries are read-only but sensitive.",
  },
  {
    routePattern: "/api/preferences/**",
    authMode: "session_or_ephemeral",
    scopes: ["preferences.read", "preferences.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "User-level preference storage.",
  },
  {
    routePattern: "/api/notifications/**",
    authMode: "session_or_ephemeral",
    scopes: ["notifications.read", "notifications.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Notification center and unread counters.",
  },
  {
    routePattern: "/api/saved-searches/**",
    authMode: "session_or_ephemeral",
    scopes: ["saved_searches.read", "saved_searches.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Saved search persistence.",
  },
  {
    routePattern: "/api/buyers/**",
    authMode: "service_or_session",
    scopes: ["buyers.read", "buyers.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Buyer CRM and outreach surfaces.",
  },
  {
    routePattern: "/api/proactive/**",
    authMode: "service_or_session",
    scopes: ["proactive.read", "proactive.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Proactive action and trigger management.",
  },
  {
    routePattern: "/api/assets/**",
    authMode: "service_or_session",
    scopes: ["assets.read", "assets.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Binary metadata should go through the app; use signed URLs for direct object transfer.",
  },
  {
    routePattern: "/api/evidence",
    authMode: "service_or_session",
    scopes: ["evidence.read", "evidence.write"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "session_cookie",
    notes: "Evidence retrieval and creation.",
  },
  {
    routePattern: "/api/observability/events",
    authMode: "service_or_session",
    scopes: ["observability.write"],
    browserCallable: true,
    exposeExternally: false,
    frontendCredentialSource: "session_cookie",
    notes: "Client telemetry ingest. Keep private to your product surfaces and trusted SDKs.",
  },
  {
    routePattern: "/api/automation/events",
    authMode: "webhook",
    scopes: ["automation.events.write"],
    browserCallable: false,
    exposeExternally: false,
    frontendCredentialSource: "never_browser",
    notes: "Machine-to-machine automation ingest only.",
  },
  {
    routePattern: "/api/public/mhc-owner-submissions",
    authMode: "public",
    scopes: ["public.forms.submit"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "none",
    notes: "Anonymous public form endpoint with rate limiting and honeypot protection.",
  },
  {
    routePattern: "/api/seller-submissions",
    authMode: "public",
    scopes: ["public.forms.submit"],
    browserCallable: true,
    exposeExternally: true,
    frontendCredentialSource: "none",
    notes: "Anonymous seller intake path with rate limiting and honeypot protection.",
  },
  {
    routePattern: "/api/health",
    authMode: "admin",
    scopes: ["health.read"],
    browserCallable: false,
    exposeExternally: false,
    frontendCredentialSource: "never_browser",
    notes: "Operational health endpoint for monitors and operators.",
  },
  {
    routePattern: "/api/admin/sentinel-alerts",
    authMode: "webhook",
    scopes: ["webhook.sentinel.ingest"],
    browserCallable: false,
    exposeExternally: false,
    frontendCredentialSource: "never_browser",
    notes: "Webhook-style sentinel receiver. Keep independently keyed from admin control-plane access.",
  },
  {
    routePattern: "/api/admin/**",
    authMode: "admin",
    scopes: ["admin.read", "admin.write", "admin.deploy", "admin.observability.read"],
    browserCallable: false,
    exposeExternally: false,
    frontendCredentialSource: "never_browser",
    notes: "Application control-plane APIs. Keep out of partner/public surface area.",
  },
  {
    routePattern: "/api/cron/**",
    authMode: "webhook",
    scopes: ["cron.invoke"],
    browserCallable: false,
    exposeExternally: false,
    frontendCredentialSource: "never_browser",
    notes: "Scheduler-only trigger paths.",
  },
] as const satisfies readonly EndpointScopeRule[];
