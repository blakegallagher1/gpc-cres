import "server-only";
import { Webhook } from "svix";
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@entitlement-os/db";
import { randomUUID } from "node:crypto";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { logger } from "@/lib/logger";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseOrgMap(raw?: string): Map<string, string> {
  const entries = new Map<string, string>();
  if (!raw) return entries;
  for (const part of raw.split(",")) {
    const [key, orgId] = part.split("=").map((value) => value?.trim());
    if (key && orgId) {
      entries.set(key.toLowerCase(), orgId);
    }
  }
  return entries;
}

function resolveProvisioningOrgId(email: string): string | null {
  const normalized = normalizeEmail(email);
  const domain = normalized.slice(normalized.indexOf("@") + 1);
  const orgMap = parseOrgMap(process.env.CLERK_WEBHOOK_ORG_MAP);
  return (
    orgMap.get(normalized) ??
    orgMap.get(`@${domain}`) ??
    orgMap.get(domain) ??
    orgMap.get("*") ??
    process.env.CLERK_WEBHOOK_DEFAULT_ORG_ID?.trim() ??
    null
  );
}

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    logger.error("Clerk webhook verification failed", { error: err });
    return new Response("Verification failed", { status: 400 });
  }

  if (evt.type === "user.created") {
    const email = evt.data.email_addresses?.[0]?.email_address;
    if (!email) {
      logger.warn("Clerk webhook user.created missing email", { clerkUserId: evt.data.id });
      return new Response("OK", { status: 200 });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isEmailAllowed(normalizedEmail)) {
      logger.warn("Clerk webhook user.created blocked by allowlist", { email: normalizedEmail });
      return new Response("OK", { status: 200 });
    }

    try {
      const existing = await prisma.user.findFirst({ where: { email: normalizedEmail }, select: { id: true } });
      if (!existing) {
        const orgId = resolveProvisioningOrgId(normalizedEmail);
        if (!orgId) {
          logger.error("Clerk webhook provisioning skipped: no explicit org mapping", { email: normalizedEmail });
          return new Response("No provisioning org configured", { status: 202 });
        }
        const org = await prisma.org.findUnique({ where: { id: orgId }, select: { id: true } });
        if (!org) {
          logger.error("Clerk webhook provisioning failed: configured org not found", {
            email: normalizedEmail,
            orgId,
          });
          return new Response("Configured org not found", { status: 500 });
        }
        const userId = randomUUID();
        await prisma.user.create({ data: { id: userId, email: normalizedEmail } });
        await prisma.orgMembership.create({
          data: { userId, orgId: org.id, role: "member" },
        });
        logger.info("Clerk webhook user provisioned", { email: normalizedEmail, orgId: org.id });
      }
    } catch (error) {
      logger.error("Clerk webhook provisioning error", { email: normalizedEmail, error });
      return new Response("Provisioning error", { status: 500 });
    }
  }

  return new Response("OK", { status: 200 });
}
