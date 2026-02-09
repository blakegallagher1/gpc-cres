import { Connection, Client } from "@temporalio/client";

let cachedClient: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (cachedClient) return cachedClient;

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  cachedClient = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  return cachedClient;
}
