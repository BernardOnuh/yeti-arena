import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // Hide Next.js's floating developer button; it looks like part of the app in demos.
  devIndicators: false,
};

export default nextConfig;
