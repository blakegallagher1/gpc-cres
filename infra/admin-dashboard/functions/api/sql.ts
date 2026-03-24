interface Env {
  UPSTREAM_GATEWAY_URL: string;
  LOCAL_API_KEY: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

interface SqlRequest {
  sql: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json() as SqlRequest;
    const { sql } = body;

    if (!sql) {
      return Response.json({ error: "sql required" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${env.LOCAL_API_KEY}`,
      "Content-Type": "application/json",
    };

    if (env.CF_ACCESS_CLIENT_ID) {
      headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    }

    if (env.CF_ACCESS_CLIENT_SECRET) {
      headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
    }

    const res = await fetch(`${env.UPSTREAM_GATEWAY_URL}/admin/db/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sql }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }

    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: `Query failed: ${String(err)}` },
      { status: 502 }
    );
  }
};
