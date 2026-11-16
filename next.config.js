/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Blob client handler pulls in undici. Keep the SDK external to
  // Next.js's webpack server bundle so Node.js resolves it at runtime.
  experimental: {
    serverComponentsExternalPackages: ["@vercel/blob"],
  },
};

module.exports = nextConfig;
