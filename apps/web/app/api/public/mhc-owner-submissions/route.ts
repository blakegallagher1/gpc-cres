import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { checkRateLimit } from "@/lib/server/rateLimiter";

export const runtime = "nodejs";

const ROUTE_KEY = "public-mhc-owner-submissions";
const HONEYPOT_FIELD = "website";

const submissionSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(25)
    .regex(/^[0-9+()\-.\s]+$/, "Invalid phone format")
    .refine((value) => value.replace(/\D/g, "").length >= 7, {
      message: "Phone must include at least 7 digits",
    }),
  company: z.string().trim().max(120).optional(),
  locationAddress1: z.string().trim().min(1).max(120),
  locationAddress2: z.string().trim().max(120).optional(),
  locationCity: z.string().trim().min(1).max(80),
  locationState: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase()),
  locationPostalCode: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/),
  notes: z.string().trim().max(2_000).optional(),
  source: z.string().trim().max(120).optional(),
  [HONEYPOT_FIELD]: z.string().max(200).optional(),
});

type SubmissionInput = z.infer<typeof submissionSchema>;

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function normalizeText(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function failureResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  details?: Record<string, string[] | undefined>,
) {
  return NextResponse.json(
    {
      ok: false,
      requestId,
      error: {
        code,
        message,
        details,
      },
    },
    { status },
  );
}

async function persistSubmission(
  submission: SubmissionInput,
  clientIp: string,
  request: NextRequest,
): Promise<{ id: string; created_at: Date }> {
  const result = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
    INSERT INTO public_mhc_owner_submissions (
      first_name,
      last_name,
      email,
      phone,
      company,
      location_address_1,
      location_address_2,
      location_city,
      location_state,
      location_postal_code,
      notes,
      source,
      honeypot_value,
      ip_address,
      user_agent,
      referrer
    ) VALUES (
      ${submission.firstName.trim()},
      ${submission.lastName.trim()},
      ${submission.email.trim().toLowerCase()},
      ${submission.phone.trim()},
      ${normalizeText(submission.company)},
      ${submission.locationAddress1.trim()},
      ${normalizeText(submission.locationAddress2)},
      ${submission.locationCity.trim()},
      ${submission.locationState},
      ${submission.locationPostalCode.trim()},
      ${normalizeText(submission.notes)},
      ${normalizeText(submission.source)},
      ${normalizeText(submission[HONEYPOT_FIELD])},
      ${clientIp},
      ${normalizeText(request.headers.get("user-agent") ?? undefined)},
      ${normalizeText(request.headers.get("referer") ?? undefined)}
    )
    RETURNING id, created_at
  `;

  const [created] = result;
  if (!created) {
    throw new Error("Submission persistence returned no row");
  }
  return created;
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const clientIp = getClientIp(request);

  if (!checkRateLimit(`${ROUTE_KEY}:${clientIp}`, 5, 0.1)) {
    return failureResponse(requestId, 429, "RATE_LIMITED", "Too many requests. Please try again shortly.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failureResponse(requestId, 400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return failureResponse(
      requestId,
      400,
      "VALIDATION_ERROR",
      "Submission payload is invalid.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const submission = parsed.data;
  const honeypotValue = normalizeText(submission[HONEYPOT_FIELD]);
  if (honeypotValue) {
    console.warn("[public.mhc-owner-submissions] honeypot triggered", {
      requestId,
      clientIp,
      route: ROUTE_KEY,
    });
    return failureResponse(requestId, 400, "BOT_DETECTED", "Submission rejected.");
  }

  try {
    const created = await persistSubmission(submission, clientIp, request);

    console.info("[public.mhc-owner-submissions] submission persisted", {
      requestId,
      submissionId: created.id,
      source: normalizeText(submission.source),
      route: ROUTE_KEY,
      clientIp,
    });

    return NextResponse.json(
      {
        ok: true,
        requestId,
        data: {
          submissionId: created.id,
          receivedAt: created.created_at.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        route: "api.public.mhc-owner-submissions",
        method: "POST",
      },
      extra: {
        requestId,
      },
    });

    console.error("[public.mhc-owner-submissions] failed to persist submission", {
      requestId,
      clientIp,
      error,
    });

    return failureResponse(requestId, 500, "INTERNAL_ERROR", "Unable to process submission at this time.");
  }
}
