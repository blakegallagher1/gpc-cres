interface Env {
  DB: D1Database;
}

interface DeployRow {
  deployed_at: string;
  commit: string;
  message: string;
  status: string;
  duration_seconds: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare(
      "SELECT deployed_at, commit, message, status, duration_seconds FROM deploys ORDER BY deployed_at DESC LIMIT 20"
    ).all();

    const rows = (result.results as DeployRow[]) || [];
    return Response.json(rows);
  } catch (err) {
    return Response.json(
      { error: `Failed to fetch deploys: ${String(err)}` },
      { status: 500 }
    );
  }
};
