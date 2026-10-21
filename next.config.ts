import type { NextConfig } from "next";

// GitHub Pages serves static files only, so the whole site is exported to
// plain HTML/JS (`out/`). The site lives under https://<user>.github.io/kpi-poct/
// on Pages, hence the basePath; the deploy workflow sets NEXT_PUBLIC_BASE_PATH.
// Leave it empty for local dev or when the site later moves to Vercel.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
