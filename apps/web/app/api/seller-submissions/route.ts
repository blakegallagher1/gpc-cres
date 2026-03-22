import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/server/rateLimiter";
import * as Sentry from "@sentry/nextjs";

const ROUTE_KEY = "seller-submissions";

const sellerSubmissionSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  propertyAddress: z.string().trim().min(1, "Property address is required"),
  details: z.string().trim().max(2000).optional(),
  company: z.string().trim().max(200).optional(),
});

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  if (!checkRateLimit(`${ROUTE_KEY}:${ip}`, 5, 60)) {
    console.warn("[seller-submissions] rate limited", { ip });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sellerSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.company && parsed.data.company.length > 0) {
    console.warn("[seller-submissions] honeypot triggered");
    return NextResponse.json({ error: "Rejected" }, { status: 400 });
  }

  console.info("[seller-submissions] submission received", { hasDetails: Boolean(parsed.data.details) });

  return NextResponse.json({ ok: true }, { status: 200 });
}
