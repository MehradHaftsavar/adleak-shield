/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,


  experimental: {
    serverComponentsExternalPackages: ["mssql", "bcryptjs"],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Tell webpack to ignore these Node.js built-in modules in client bundles
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "node:stream": false,
        "node:crypto": false,
        "node:buffer": false,
        "node:util": false,
        "node:net": false,
        "node:tls": false,
        "node:fs": false,
        "node:path": false,
        "node:os": false,
        "node:events": false,
        stream: false,
        crypto: false,
        net: false,
        tls: false,
        fs: false,
      };
    }
    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;