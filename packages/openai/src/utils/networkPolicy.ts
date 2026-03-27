/**
 * Two-layer network allowlisting for hosted shell containers (P3 Patterns 15, 19).
 * Org-level defines maximum allowed domains; request-level must be a subset.
 */

export type OrgNetworkPolicy = {
  orgId: string;
  allowedDomains: string[];
  updatedAt: string;
};

export type RequestNetworkPolicy = {
  type: "allowlist";
  allowed_domains: string[];
  domain_secrets?: Array<{ domain: string; name: string; value: string }>;
};

// In-memory org policy store (will be Prisma-backed later)
const orgPolicies = new Map<string, OrgNetworkPolicy>();

const DEFAULT_ORG_DOMAINS = [
  "gallagherpropco.com",
  "api.gallagherpropco.com",
  "gateway.gallagherpropco.com",
];

export function setOrgPolicy(orgId: string, allowedDomains: string[]): OrgNetworkPolicy {
  const policy: OrgNetworkPolicy = {
    orgId,
    allowedDomains: [...new Set(allowedDomains)],
    updatedAt: new Date().toISOString(),
  };
  orgPolicies.set(orgId, policy);
  return policy;
}

export function getOrgPolicy(orgId: string): OrgNetworkPolicy {
  return orgPolicies.get(orgId) ?? {
    orgId,
    allowedDomains: DEFAULT_ORG_DOMAINS,
    updatedAt: new Date().toISOString(),
  };
}

export function validateRequestDomains(
  orgId: string,
  requestDomains: string[],
): { valid: boolean; rejected: string[] } {
  const orgPolicy = getOrgPolicy(orgId);
  const rejected = requestDomains.filter(
    (domain) => !orgPolicy.allowedDomains.includes(domain),
  );
  return { valid: rejected.length === 0, rejected };
}

export function buildRequestNetworkPolicy(
  orgId: string,
  requestDomains: string[],
  secrets?: Array<{ domain: string; name: string; value: string }>,
): RequestNetworkPolicy | { error: string } {
  const validation = validateRequestDomains(orgId, requestDomains);
  if (!validation.valid) {
    return { error: `Domains not in org allowlist: ${validation.rejected.join(", ")}` };
  }
  return {
    type: "allowlist",
    allowed_domains: requestDomains,
    ...(secrets && secrets.length > 0 ? { domain_secrets: secrets } : {}),
  };
}

export function isDomainAllowed(orgId: string, domain: string): boolean {
  const policy = getOrgPolicy(orgId);
  return policy.allowedDomains.includes(domain);
}

// For testing
export function _clearPolicies(): void {
  orgPolicies.clear();
}
