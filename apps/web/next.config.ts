import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@entitlement-os/shared",
    "@entitlement-os/db",
    "@entitlement-os/openai",
  ],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
