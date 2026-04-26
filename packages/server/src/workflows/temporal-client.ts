import "server-only";

import type { Client } from "@temporalio/client";

let cachedClient: Client | null = null;

type TemporalClientModule = typeof import("@temporalio/client");

const importTemporalClientModule = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<TemporalClientModule>;

export async function getTemporalClient(): Promise<Client> {
  const address = process.env.TEMPORAL_ADDRESS;
  if (!address) {
    throw new Error(
      "TEMPORAL_ADDRESS is not configured — Temporal workflows are unavailable in this environment"
    );
  }

  if (cachedClient) {
    return cachedClient;
  }

  const { Client, Connection } =
    await importTemporalClientModule("@temporalio/client");

  const connection = await Connection.connect({
    address,
    connectTimeout: 5_000,
  });

  cachedClient = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  return cachedClient;
}
