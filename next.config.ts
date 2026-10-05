import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import path from "node:path";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();
const questIds = readdirSync(path.join(process.cwd(), "content/quests"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Ne JAMAIS recharger la page au retour du réseau : cela couperait une quête en cours.
  reloadOnOnline: false,
  cacheOnNavigation: true,
  additionalPrecacheEntries: [
    { url: "/", revision },
    { url: "/confidentialite", revision },
    { url: "/reglages", revision },
    { url: "/hors-ligne", revision },
    ...questIds.map((id) => ({ url: `/jouer/${id}`, revision })),
  ],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default withSerwist(nextConfig);
