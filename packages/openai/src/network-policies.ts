export type NetworkPolicySecretEnvRef = `env:${string}`;

export type NetworkPolicyDomainSecretEnvRef = {
  domain: string;
  name: string;
  env: NetworkPolicySecretEnvRef;
};

export type NetworkPolicyDefinition = {
  allowlist: readonly string[];
  secrets?: Readonly<Record<string, NetworkPolicySecretEnvRef>>;
  domainSecretEnvRefs?: readonly NetworkPolicyDomainSecretEnvRef[];
};

export const NETWORK_POLICIES = {
  DENY_ALL: {
    allowlist: [],
  },
  SUPABASE_ONLY: {
    allowlist: ["*.supabase.co"],
    secrets: {
      SUPABASE_KEY: "env:SUPABASE_SERVICE_ROLE_KEY",
    },
  },
  LOCAL_GATEWAY: {
    allowlist: ["api.gallagherpropco.com", "tiles.gallagherpropco.com"],
    secrets: {
      GATEWAY_KEY: "env:LOCAL_API_KEY",
    },
  },
  CRE_DATA_SOURCES: {
    allowlist: ["*.supabase.co", "api.gallagherpropco.com"],
    domainSecretEnvRefs: [
      {
        domain: "*.supabase.co",
        name: "SUPABASE_KEY",
        env: "env:SUPABASE_SERVICE_ROLE_KEY",
      },
      {
        domain: "api.gallagherpropco.com",
        name: "GATEWAY_KEY",
        env: "env:LOCAL_API_KEY",
      },
    ],
  },
} as const satisfies Record<string, NetworkPolicyDefinition>;

export type NetworkPolicyName = keyof typeof NETWORK_POLICIES;
