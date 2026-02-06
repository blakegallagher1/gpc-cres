import { PrismaClient } from "@prisma/client";

declare const globalThis: typeof global & {
  __ENTITLEMENT_OS_PRISMA__?: PrismaClient;
};

export const prisma: PrismaClient =
  globalThis.__ENTITLEMENT_OS_PRISMA__ ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__ENTITLEMENT_OS_PRISMA__ = prisma;
}

