import type { Agent } from "@openai/agents";
import type { RunContext } from "@openai/agents";

type LazyContextArgs<TContext = unknown> = {
  runContext?: RunContext<TContext>;
  agent?: Agent<TContext, any>;
};

type LazyContextLoader<TContext = unknown> = (
  args: LazyContextArgs<TContext>,
) => Promise<string> | string;

export type LazyContextState = {
  metadataLoads: number;
  bodyLoads: number;
  resourceLoads: number;
};

export class LazyContext<TContext = unknown> {
  private readonly metadataLoader: LazyContextLoader<TContext>;
  private readonly bodyLoader: LazyContextLoader<TContext>;
  private readonly resourceLoader: LazyContextLoader<TContext>;

  private metadataValue: string | null = null;
  private bodyValue: string | null = null;
  private resourceValue: string | null = null;

  private metadataLoads = 0;
  private bodyLoads = 0;
  private resourceLoads = 0;

  constructor(config: {
    metadata: LazyContextLoader<TContext>;
    body: LazyContextLoader<TContext>;
    resources?: LazyContextLoader<TContext>;
  }) {
    this.metadataLoader = config.metadata;
    this.bodyLoader = config.body;
    this.resourceLoader = config.resources ?? (() => "");
  }

  async getMetadata(args: LazyContextArgs<TContext> = {}): Promise<string> {
    if (this.metadataValue === null) {
      this.metadataValue = (await this.metadataLoader(args)).trim();
      this.metadataLoads += 1;
    }
    return this.metadataValue;
  }

  async getBody(args: LazyContextArgs<TContext> = {}): Promise<string> {
    if (this.bodyValue === null) {
      this.bodyValue = (await this.bodyLoader(args)).trim();
      this.bodyLoads += 1;
    }
    return this.bodyValue;
  }

  async getResources(args: LazyContextArgs<TContext> = {}): Promise<string> {
    if (this.resourceValue === null) {
      this.resourceValue = (await this.resourceLoader(args)).trim();
      this.resourceLoads += 1;
    }
    return this.resourceValue;
  }

  async compose(
    args: LazyContextArgs<TContext> = {},
    options: { includeResources?: boolean } = {},
  ): Promise<string> {
    const metadata = await this.getMetadata(args);
    const body = await this.getBody(args);
    const resources =
      options.includeResources === false ? "" : await this.getResources(args);

    return [metadata, body, resources].filter(Boolean).join("\n\n");
  }

  getState(): LazyContextState {
    return {
      metadataLoads: this.metadataLoads,
      bodyLoads: this.bodyLoads,
      resourceLoads: this.resourceLoads,
    };
  }
}
