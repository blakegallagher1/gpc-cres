import "server-only";
import { Webhook } from "svix";
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@entitlement-os/db";
import { randomUUID } from "node:crypto";
import { isEmailAllowed } from "@/lib/auth/allowedEmails";
import { logger } from "@/lib/logger";

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

    if (!isEmailAllowed(email)) {
      logger.warn("Clerk webhook user.created blocked by allowlist", { email });
      return new Response("OK", { status: 200 });
    }

    try {
      const existing = await prisma.user.findFirst({ where: { email }, select: { id: true } });
      if (!existing) {
        const userId = randomUUID();
        const defaultOrg = await prisma.org.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (!defaultOrg) {
          logger.error("Clerk webhook provisioning failed: no default org", { email });
          return new Response("No default org", { status: 500 });
        }
        await prisma.user.create({ data: { id: userId, email } });
        await prisma.orgMembership.create({
          data: { userId, orgId: defaultOrg.id, role: "member" },
        });
        logger.info("Clerk webhook user provisioned", { email, orgId: defaultOrg.id });
      }
    } catch (error) {
      logger.error("Clerk webhook provisioning error", { email, error });
      return new Response("Provisioning error", { status: 500 });
    }
  }

  return new Response("OK", { status: 200 });
}
