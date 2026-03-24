interface Env {
  UPSTREAM_GATEWAY_URL: string;
  LOCAL_API_KEY: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${env.LOCAL_API_KEY}`,
    };

    if (env.CF_ACCESS_CLIENT_ID) {
      headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    }

    if (env.CF_ACCESS_CLIENT_SECRET) {
      headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
    }

    const res = await fetch(`${env.UPSTREAM_GATEWAY_URL}/admin/containers`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json(data, { status: res.status });
    }

    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: `Failed to fetch containers: ${String(err)}` },
      { status: 502 }
    );
  }
};
