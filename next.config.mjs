/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  // VAPT Security Hardening: Defense-in-depth HTTP Response Headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY', // Mitigates Clickjacking attacks
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff', // Mitigates MIME type confusion and sniffing
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin', // Prevents sensitive URL parameter leakage
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block', // Legacy browser XSS filter
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(), browsing-topics=()', // Grants media recording capabilities to self origin while blocking external tracking
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload', // Enforces HTTPS
          },
        ],
      },
    ]
  },
}

export default nextConfig
