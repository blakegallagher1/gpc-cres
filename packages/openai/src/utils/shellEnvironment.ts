/**
 * OpenAI hosted shell environment configuration for non-CUA tasks.
 * Uses container_auto for data processing, report generation, and API calls
 * without needing the Windows server infrastructure.
 */

export type ShellEnvironmentConfig = {
  type: "shell";
  environment: {
    type: "container_auto" | "container_reference";
    container_id?: string;
    network_policy?: {
      type: "allowlist";
      allowed_domains: string[];
      domain_secrets?: Array<{
        domain: string;
        name: string;
        value: string;
      }>;
    };
    skills?: Array<{
      type: "skill_reference";
      skill_id: string;
      version?: number | "latest";
    }>;
    memory_limit?: "1g" | "4g" | "16g" | "64g";
  };
};

const DEFAULT_ALLOWED_DOMAINS = [
  "gallagherpropco.com",
  "api.gallagherpropco.com",
  "gateway.gallagherpropco.com",
];

/**
 * Build a container_auto shell tool configuration for non-browser tasks.
 */
export function buildHostedShellConfig(options?: {
  skills?: Array<{ skill_id: string; version?: number | "latest" }>;
  additionalDomains?: string[];
  memoryLimit?: "1g" | "4g" | "16g" | "64g";
}): ShellEnvironmentConfig {
  const allowedDomains = [
    ...DEFAULT_ALLOWED_DOMAINS,
    ...(options?.additionalDomains ?? []),
  ];

  const domainSecrets = buildDomainSecrets(allowedDomains);

  return {
    type: "shell",
    environment: {
      type: "container_auto",
      network_policy: {
        type: "allowlist",
        allowed_domains: allowedDomains,
        ...(domainSecrets.length > 0 ? { domain_secrets: domainSecrets } : {}),
      },
      ...(options?.skills ? {
        skills: options.skills.map((s) => ({
          type: "skill_reference" as const,
          skill_id: s.skill_id,
          ...(s.version != null ? { version: s.version } : {}),
        })),
      } : {}),
      ...(options?.memoryLimit ? { memory_limit: options.memoryLimit } : {}),
    },
  };
}

/**
 * Build a container_reference shell tool configuration for reusing an existing container.
 */
export function buildContainerReferenceConfig(containerId: string): ShellEnvironmentConfig {
  return {
    type: "shell",
    environment: {
      type: "container_reference",
      container_id: containerId,
    },
  };
}

function buildDomainSecrets(
  domains: string[],
): Array<{ domain: string; name: string; value: string }> {
  const secretMap: Record<string, { envVar: string; name: string }> = {
    "api.gallagherpropco.com": { envVar: "LOCAL_API_KEY", name: "GATEWAY_KEY" },
    "gateway.gallagherpropco.com": { envVar: "GATEWAY_PROXY_TOKEN", name: "GATEWAY_TOKEN" },
  };

  const secrets: Array<{ domain: string; name: string; value: string }> = [];
  for (const domain of domains) {
    const config = secretMap[domain];
    if (config) {
      const value = process.env[config.envVar];
      if (value) {
        secrets.push({ domain, name: config.name, value });
      }
    }
  }
  return secrets;
}
