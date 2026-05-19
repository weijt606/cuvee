import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Hide the Next.js dev indicator badge (bottom-right floating pip + "static/dynamic"
  // route hint). Keeps the live demo clean — they're invisible in production anyway,
  // disabling them locally just matches what judges will see.
  devIndicators: false,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fal.media" },
      { protocol: "https", hostname: "**.fal.ai" },
      { protocol: "https", hostname: "fal.media" },
      { protocol: "https", hostname: "oaidalleapiprodscus.blob.core.windows.net" },
      { protocol: "https", hostname: "cdn.openai.com" },
    ],
  },
};

export default config;
