import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const expected = process.env.LOCAL_API_KEY ?? "";
  if (!token || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const env = {
    GATEWAY_DATABASE_URL: (process.env.GATEWAY_DATABASE_URL ?? "").substring(0, 40),
    LOCAL_API_KEY: expected ? `${expected.substring(0, 4)}...` : "NOT SET",
    CF_ACCESS_CLIENT_ID: (process.env.CF_ACCESS_CLIENT_ID ?? "NOT SET").substring(0, 10) + "...",
    NODE_ENV: process.env.NODE_ENV,
  };

  try {
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    return NextResponse.json({ ok: true, env, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, env, error: msg.substring(0, 500) });
  }
}
