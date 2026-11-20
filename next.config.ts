import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle that the multi-stage Dockerfile copies
  // into the slim runtime image (see Dockerfile, "runner" stage).
  output: "standalone",

  // pdf-parse bundles a large PDF.js build that must run from real files on
  // disk (it reads its own assets relative to __dirname). Keeping it external
  // makes Next.js `require()` it at runtime instead of inlining it.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
