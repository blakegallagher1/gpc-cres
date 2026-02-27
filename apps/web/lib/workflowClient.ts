import "server-only";

import { Client, Connection } from "@temporalio/client";

let cachedClient: Client | null = null;

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
