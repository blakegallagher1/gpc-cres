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
  async headers() {
    const allowedOrigins = process.env.ALLOWED_CORS_ORIGINS
      ? process.env.ALLOWED_CORS_ORIGINS.split(",").map((o) => o.trim())
      : ["https://gallagherpropco.com", "https://www.gallagherpropco.com"];
    // In development, also allow localhost
    if (process.env.NODE_ENV === "development") {
      allowedOrigins.push("http://localhost:3000");
    }

    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: allowedOrigins.join(", ") },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Vary", value: "Origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
