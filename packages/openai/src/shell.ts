import OpenAI from "openai";
import { z } from "zod";

import {
  NETWORK_POLICIES,
  type NetworkPolicyDomainSecretEnvRef,
  type NetworkPolicyDefinition,
  type NetworkPolicySecretEnvRef,
} from "./network-policies.js";
import { buildResponseCreateParams } from "./responses.js";

const OPENAI_CLIENT_MAX_RETRIES = 0;
const DEFAULT_SHELL_MODEL = process.env.OPENAI_SHELL_MODEL ?? "gpt-5.4-mini";
const DEFAULT_EXEC_TIMEOUT_MS = 120_000;
const DEFAULT_EXEC_MAX_OUTPUT_CHARS = 50_000;
const DEFAULT_SHELL_PROMPT_CACHE_KEY = process.env.OPENAI_SHELL_PROMPT_CACHE_KEY ?? "entitlement-os-shell";
const DOMAIN_SECRET_ENV_PREFIX = "env:";

let cachedClient: OpenAI | null = null;

function getClient(apiKey?: string): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is required");
  }

  if (apiKey) {
    return new OpenAI({ apiKey: key, maxRetries: OPENAI_CLIENT_MAX_RETRIES });
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: key, maxRetries: OPENAI_CLIENT_MAX_RETRIES });
  }

  return cachedClient;
}

function extractResponseId(response: OpenAI.Responses.Response): string | null {
  const candidate = (response as { id?: unknown; response_id?: unknown }).id
    ?? (response as { response_id?: unknown }).response_id;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function nextHereDocMarker(content: string): string {
  let marker = "__ENTITLEMENT_SHELL_EOF__";
  let attempt = 0;
  while (content.includes(marker)) {
    attempt += 1;
    marker = `__ENTITLEMENT_SHELL_EOF_${attempt}__`;
  }
  return marker;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function extractShellExecution(
  response: OpenAI.Responses.Response,
  fallbackSessionId: string | null,
): ShellExecResult {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let exitCode: number | null = null;
  let timedOut = false;
  let sessionId = fallbackSessionId;

  const outputItems = Array.isArray(response.output) ? response.output : [];
  for (const item of outputItems) {
    if (item.type === "shell_call") {
      const environment = item.environment;
      if (
        environment
        && environment.type === "container_reference"
        && typeof environment.container_id === "string"
      ) {
        sessionId = environment.container_id;
      }
    }

    if (item.type === "shell_call_output") {
      for (const chunk of item.output) {
        if (typeof chunk.stdout === "string" && chunk.stdout.length > 0) {
          stdoutChunks.push(chunk.stdout);
        }
        if (typeof chunk.stderr === "string" && chunk.stderr.length > 0) {
          stderrChunks.push(chunk.stderr);
        }

        if (chunk.outcome.type === "exit") {
          exitCode = chunk.outcome.exit_code;
        }
        if (chunk.outcome.type === "timeout") {
          timedOut = true;
        }
      }
    }
  }

  const responseId = extractResponseId(response);
  const stdout = stdoutChunks.join("");
  const stderr = stderrChunks.join("");

  if (!stdout && typeof response.output_text === "string" && response.output_text.length > 0) {
    return ShellExecResultSchema.parse({
      stdout: response.output_text,
      stderr,
      exitCode,
      timedOut,
      responseId,
      sessionId,
    });
  }

  return ShellExecResultSchema.parse({
    stdout,
    stderr,
    exitCode,
    timedOut,
    responseId,
    sessionId,
  });
}

export const ShellDomainSecretEnvRefSchema = z.object({
  domain: z.string().min(1),
  name: z.string().min(1),
  env: z.string().min(1),
  required: z.boolean().optional(),
});

export type ShellDomainSecretEnvRef = z.infer<typeof ShellDomainSecretEnvRefSchema>;

const ShellPolicySecretsSchema = z.record(
  z.string().min(1),
  z
    .string()
    .min(1)
    .regex(/^env:[A-Za-z_][A-Za-z0-9_]*$/),
);

const ShellPolicyDomainSecretEnvRefSchema = z.object({
  domain: z.string().min(1),
  name: z.string().min(1),
  env: z
    .string()
    .min(1)
    .regex(/^env:[A-Za-z_][A-Za-z0-9_]*$/),
});

export const ShellPolicyDefinitionSchema = z.object({
  allowlist: z.array(z.string().min(1)).readonly(),
  secrets: ShellPolicySecretsSchema.optional(),
  domainSecretEnvRefs: z.array(ShellPolicyDomainSecretEnvRefSchema).optional(),
});

export type ShellPolicyDefinition = z.infer<typeof ShellPolicyDefinitionSchema>;

const ShellNetworkPolicyDisabledSchema = z.object({
  type: z.literal("disabled"),
});

const ShellNetworkPolicyAllowlistSchema = z.object({
  type: z.literal("allowlist"),
  allowed_domains: z.array(z.string().min(1)).min(1),
  domain_secrets: z
    .array(
      z.object({
        domain: z.string().min(1),
        name: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .optional(),
});

export const ShellNetworkPolicySchema = z.union([
  ShellNetworkPolicyDisabledSchema,
  ShellNetworkPolicyAllowlistSchema,
]);

export type ShellNetworkPolicy =
  | OpenAI.Responses.ContainerNetworkPolicyDisabled
  | OpenAI.Responses.ContainerNetworkPolicyAllowlist;

export const SHELL_NETWORK_POLICY_DENY_ALL: ShellNetworkPolicy = {
  type: "disabled",
};

const ShellExecRequestSchema = z
  .object({
    command: z.string().min(1).optional(),
    commands: z.array(z.string().min(1)).min(1).optional(),
    timeoutMs: z.number().int().positive().max(600_000).optional(),
    maxOutputChars: z.number().int().positive().max(2_000_000).optional(),
  })
  .refine((value) => Boolean(value.command) || Boolean(value.commands), {
    message: "Either command or commands is required",
    path: ["command"],
  });

const ShellWriteFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const ShellReadFileSchema = z.object({
  path: z.string().min(1),
});

export const ShellExecResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int().nullable(),
  timedOut: z.boolean(),
  responseId: z.string().nullable(),
  sessionId: z.string().nullable(),
});

export const ShellWriteFileResultSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  responseId: z.string().nullable(),
  sessionId: z.string().nullable(),
});

export const ShellReadFileResultSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  responseId: z.string().nullable(),
  sessionId: z.string().nullable(),
});

export type ShellExecRequest = z.infer<typeof ShellExecRequestSchema>;
export type ShellExecResult = z.infer<typeof ShellExecResultSchema>;
export type ShellWriteFileResult = z.infer<typeof ShellWriteFileResultSchema>;
export type ShellReadFileResult = z.infer<typeof ShellReadFileResultSchema>;

export const CreateShellSessionOptionsSchema = z.object({
  apiKey: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  allowlist: z.array(z.string().min(1)).optional(),
  secrets: ShellPolicySecretsSchema.optional(),
  networkPolicy: ShellNetworkPolicySchema.optional(),
  policy: ShellPolicyDefinitionSchema.optional(),
  allowedDomains: z.array(z.string().min(1)).optional(),
  domainSecretEnvRefs: z.array(ShellDomainSecretEnvRefSchema).optional(),
  requireDomainSecrets: z.boolean().optional(),
  reuse: z.boolean().optional(),
  reuseSession: z.boolean().optional(),
  trackSession: z.boolean().optional(),
  sessionId: z.string().min(1).nullable().optional(),
});

export type CreateShellSessionOptions = z.infer<typeof CreateShellSessionOptionsSchema>;

export type CloseShellSessionOptions = {
  preserveSession?: boolean;
};

export type ShellSession = {
  readonly model: string;
  readonly networkPolicy: ShellNetworkPolicy;
  readonly reuseSession: boolean;
  readonly trackSession: boolean;
  readonly sessionId: string | null;
  readonly lastResponseId: string | null;
  exec: (params: ShellExecRequest) => Promise<ShellExecResult>;
  writeFile: (path: string, content: string) => Promise<ShellWriteFileResult>;
  readFile: (path: string) => Promise<ShellReadFileResult>;
  close: (options?: CloseShellSessionOptions) => Promise<void>;
};

export type DomainSecretMappingOptions = {
  requireAll?: boolean;
};

export function mapDomainSecretsFromEnvRefs(
  refs: readonly ShellDomainSecretEnvRef[],
  options: DomainSecretMappingOptions = {},
): OpenAI.Responses.ContainerNetworkPolicyDomainSecret[] {
  const parsedRefs = z.array(ShellDomainSecretEnvRefSchema).parse(refs);
  const mapped: OpenAI.Responses.ContainerNetworkPolicyDomainSecret[] = [];

  for (const ref of parsedRefs) {
    const value = process.env[ref.env];
    const required = ref.required ?? options.requireAll ?? false;
    if (!value || value.length === 0) {
      if (required) {
        throw new Error(`Missing required environment variable: ${ref.env}`);
      }
      continue;
    }

    mapped.push({
      domain: normalizeDomain(ref.domain),
      name: ref.name,
      value,
    });
  }

  return mapped;
}

function envRefToEnvVar(envRef: NetworkPolicySecretEnvRef): string {
  if (!envRef.startsWith(DOMAIN_SECRET_ENV_PREFIX)) {
    throw new Error(`Unsupported secret reference: ${envRef}`);
  }

  const envVar = envRef.slice(DOMAIN_SECRET_ENV_PREFIX.length).trim();
  if (envVar.length === 0) {
    throw new Error(`Invalid secret reference: ${envRef}`);
  }

  return envVar;
}

export function policyToDomainSecretEnvRefs(
  policy: NetworkPolicyDefinition | ShellPolicyDefinition,
): ShellDomainSecretEnvRef[] {
  const parsedPolicy = ShellPolicyDefinitionSchema.parse(policy);
  const explicitDomainRefs = parsedPolicy.domainSecretEnvRefs as
    | NetworkPolicyDomainSecretEnvRef[]
    | undefined;
  if (explicitDomainRefs && explicitDomainRefs.length > 0) {
    return explicitDomainRefs.map((entry) => ({
      domain: entry.domain,
      name: entry.name,
      env: envRefToEnvVar(entry.env),
    }));
  }

  const refs: ShellDomainSecretEnvRef[] = [];
  const secrets = parsedPolicy.secrets ?? {};
  for (const domain of parsedPolicy.allowlist) {
    for (const [name, envRef] of Object.entries(secrets)) {
      refs.push({
        domain,
        name,
        env: envRefToEnvVar(envRef as NetworkPolicySecretEnvRef),
      });
    }
  }

  return refs;
}

export function createAllowlistNetworkPolicy(
  allowedDomains: readonly string[],
  domainSecretEnvRefs: readonly ShellDomainSecretEnvRef[] = [],
  options: DomainSecretMappingOptions = {},
): OpenAI.Responses.ContainerNetworkPolicyAllowlist {
  const normalizedDomains = Array.from(
    new Set(allowedDomains.map((domain) => normalizeDomain(domain)).filter(Boolean)),
  );

  if (normalizedDomains.length === 0) {
    throw new Error("allowlist network policy requires at least one domain");
  }

  const domainSecrets = mapDomainSecretsFromEnvRefs(domainSecretEnvRefs, options);

  return ShellNetworkPolicyAllowlistSchema.parse({
    type: "allowlist",
    allowed_domains: normalizedDomains,
    ...(domainSecrets.length > 0 ? { domain_secrets: domainSecrets } : {}),
  }) as OpenAI.Responses.ContainerNetworkPolicyAllowlist;
}

export function buildShellPolicy(
  allowlist: readonly string[],
  secrets: Readonly<Record<string, NetworkPolicySecretEnvRef>> = {},
): ShellPolicyDefinition {
  return ShellPolicyDefinitionSchema.parse({
    allowlist,
    secrets,
  });
}

export function createNetworkPolicyFromDefinition(
  policy: NetworkPolicyDefinition | ShellPolicyDefinition,
  options: DomainSecretMappingOptions = {},
): ShellNetworkPolicy {
  const parsedPolicy = ShellPolicyDefinitionSchema.parse(policy);
  if (parsedPolicy.allowlist.length === 0) {
    return SHELL_NETWORK_POLICY_DENY_ALL;
  }

  return createAllowlistNetworkPolicy(
    parsedPolicy.allowlist,
    policyToDomainSecretEnvRefs(parsedPolicy),
    options,
  );
}

function buildShellPrompt(
  commands: string[],
  options: { timeoutMs: number; maxOutputChars: number },
): string {
  const numbered = commands.map((command, index) => `${index + 1}. ${command}`).join("\n");
  return [
    "Execute the shell commands exactly in order.",
    "Do not add extra commands.",
    `Use timeout ${options.timeoutMs}ms for each command.`,
    `Limit output to ${options.maxOutputChars} characters per command.`,
    "Return command output from the shell tool.",
    "",
    numbered,
  ].join("\n");
}

function resolveNetworkPolicy(
  options: CreateShellSessionOptions,
): ShellNetworkPolicy {
  if (options.allowlist && options.allowlist.length > 0) {
    const secrets =
      (options.secrets as Readonly<Record<string, NetworkPolicySecretEnvRef>> | undefined) ?? {};
    return createNetworkPolicyFromDefinition(
      buildShellPolicy(options.allowlist, secrets),
      { requireAll: options.requireDomainSecrets ?? false },
    );
  }

  if (options.allowedDomains && options.allowedDomains.length > 0) {
    return createAllowlistNetworkPolicy(
      options.allowedDomains,
      options.domainSecretEnvRefs ?? [],
      { requireAll: options.requireDomainSecrets ?? false },
    );
  }

  if (options.policy) {
    return createNetworkPolicyFromDefinition(options.policy, {
      requireAll: options.requireDomainSecrets ?? false,
    });
  }

  if (options.networkPolicy) {
    return ShellNetworkPolicySchema.parse(options.networkPolicy) as ShellNetworkPolicy;
  }

  return createNetworkPolicyFromDefinition(NETWORK_POLICIES.DENY_ALL);
}

function buildShellEnvironment(
  networkPolicy: ShellNetworkPolicy,
  reuseSession: boolean,
  sessionId: string | null,
): OpenAI.Responses.ContainerAuto | OpenAI.Responses.ContainerReference {
  if (reuseSession && sessionId) {
    return {
      type: "container_reference",
      container_id: sessionId,
    };
  }

  return {
    type: "container_auto",
    network_policy: networkPolicy,
  };
}

export function createShellSession(rawOptions: CreateShellSessionOptions = {}): ShellSession {
  const options = CreateShellSessionOptionsSchema.parse(rawOptions);
  const model = options.model ?? DEFAULT_SHELL_MODEL;
  const networkPolicy = resolveNetworkPolicy(options);
  const reuseSession = options.reuse ?? options.reuseSession ?? true;
  const trackSession = options.trackSession ?? true;
  const client = getClient(options.apiKey);

  let closed = false;
  let sessionId = options.sessionId ?? null;
  let lastResponseId: string | null = null;

  function ensureOpen(): void {
    if (closed) {
      throw new Error("Shell session is already closed");
    }
  }

  async function exec(rawRequest: ShellExecRequest): Promise<ShellExecResult> {
    ensureOpen();
    const request = ShellExecRequestSchema.parse(rawRequest);
    const commands = request.commands ?? (request.command ? [request.command] : []);
    const timeoutMs = request.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;
    const maxOutputChars = request.maxOutputChars ?? DEFAULT_EXEC_MAX_OUTPUT_CHARS;

    const response = (await client.responses.create(
      buildResponseCreateParams({
        model,
        stream: false,
        store: false,
        input: [
          {
            role: "user",
            content: buildShellPrompt(commands, { timeoutMs, maxOutputChars }),
          },
        ],
        tools: [
          {
            type: "shell",
            environment: buildShellEnvironment(networkPolicy, reuseSession, sessionId),
          },
        ],
        toolChoice: {
          type: "shell",
        },
        parallelToolCalls: false,
        promptCacheKey: DEFAULT_SHELL_PROMPT_CACHE_KEY,
        ...(reuseSession && lastResponseId ? { previousResponseId: lastResponseId } : {}),
      }),
    )) as OpenAI.Responses.Response;

    const parsed = extractShellExecution(response, sessionId);

    if (trackSession && parsed.sessionId) {
      sessionId = parsed.sessionId;
    }
    if (trackSession && parsed.responseId) {
      lastResponseId = parsed.responseId;
    }

    return parsed;
  }

  async function writeFile(path: string, content: string): Promise<ShellWriteFileResult> {
    const payload = ShellWriteFileSchema.parse({ path, content });
    const marker = nextHereDocMarker(payload.content);

    const writeCommand = [
      `mkdir -p "$(dirname -- ${quoteForShell(payload.path)})"`,
      `cat > ${quoteForShell(payload.path)} <<'${marker}'`,
      payload.content,
      marker,
    ].join("\n");

    const result = await exec({
      command: writeCommand,
      timeoutMs: DEFAULT_EXEC_TIMEOUT_MS,
      maxOutputChars: DEFAULT_EXEC_MAX_OUTPUT_CHARS,
    });

    if (result.timedOut || result.exitCode !== 0) {
      throw new Error(`Failed to write file ${payload.path}: ${result.stderr || result.stdout}`);
    }

    return ShellWriteFileResultSchema.parse({
      path: payload.path,
      bytes: Buffer.byteLength(payload.content, "utf8"),
      responseId: result.responseId,
      sessionId: result.sessionId,
    });
  }

  async function readFile(path: string): Promise<ShellReadFileResult> {
    const payload = ShellReadFileSchema.parse({ path });
    const result = await exec({
      command: `cat ${quoteForShell(payload.path)}`,
      timeoutMs: DEFAULT_EXEC_TIMEOUT_MS,
      maxOutputChars: DEFAULT_EXEC_MAX_OUTPUT_CHARS,
    });

    if (result.timedOut || result.exitCode !== 0) {
      throw new Error(`Failed to read file ${payload.path}: ${result.stderr || result.stdout}`);
    }

    return ShellReadFileResultSchema.parse({
      path: payload.path,
      content: result.stdout,
      responseId: result.responseId,
      sessionId: result.sessionId,
    });
  }

  async function close(closeOptions: CloseShellSessionOptions = {}): Promise<void> {
    if (closed) {
      return;
    }
    closed = true;

    if (!closeOptions.preserveSession && sessionId) {
      await client.containers.delete(sessionId);
      sessionId = null;
      lastResponseId = null;
    }
  }

  return {
    model,
    networkPolicy,
    reuseSession,
    trackSession,
    get sessionId() {
      return sessionId;
    },
    get lastResponseId() {
      return lastResponseId;
    },
    exec,
    writeFile,
    readFile,
    close,
  };
}

export const WithShellOptionsSchema = CreateShellSessionOptionsSchema.extend({
  preserveSession: z.boolean().optional(),
});

export type WithShellOptions = z.infer<typeof WithShellOptionsSchema>;

export async function withShell<T>(
  rawOptions: WithShellOptions,
  runner: (shell: ShellSession) => Promise<T>,
): Promise<T> {
  const options = WithShellOptionsSchema.parse(rawOptions);
  const session = createShellSession(options);

  let result!: T;
  let hasResult = false;
  let runnerError: unknown;
  let closeError: unknown;

  try {
    result = await runner(session);
    hasResult = true;
  } catch (error) {
    runnerError = error;
  }

  try {
    await session.close({ preserveSession: options.preserveSession ?? false });
  } catch (error) {
    closeError = error;
  }

  if (runnerError) {
    throw runnerError;
  }
  if (closeError) {
    throw closeError;
  }

  if (!hasResult) {
    throw new Error("withShell runner did not complete");
  }

  return result;
}
