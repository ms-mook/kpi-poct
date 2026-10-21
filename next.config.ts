import type { NextConfig } from "next";

// The site is exported to plain static HTML/JS (`out/`) and hosted on Vercel,
// at the root of the domain — leave NEXT_PUBLIC_BASE_PATH empty. It exists only
// for hosting under a sub-folder (e.g. a GitHub Pages project site).
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
