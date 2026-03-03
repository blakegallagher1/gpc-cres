#!/usr/bin/env tsx
/**
 * Seed initial bcrypt password hashes for existing users.
 *
 * Usage:
 *   SEED_USER_EMAIL=blake@gallagherpropco.com \
 *   SEED_USER_PASSWORD=YourActualPassword \
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:54399/entitlement_os \
 *   tsx scripts/seed-auth-password.ts
 *
 * Run this for each user that needs to log in after Supabase auth is removed.
 * Passwords are hashed with bcrypt (cost factor 12) before storage.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_USER_PASSWORD;

  if (!email || !password) {
    console.error("Error: Set SEED_USER_EMAIL and SEED_USER_PASSWORD env vars");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Error: Password must be at least 8 characters");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  const result = await prisma.user.updateMany({
    where: { email },
    data: { passwordHash: hash },
  });

  if (result.count === 0) {
    console.error(`Error: No user found with email ${email}`);
    console.error("Users in database:");
    const users = await prisma.user.findMany({ select: { email: true } });
    users.forEach((u) => console.error(`  - ${u.email}`));
    process.exit(1);
  }

  console.log(`✓ Password hash set for ${email}`);
  console.log(`  Updated ${result.count} user row(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
