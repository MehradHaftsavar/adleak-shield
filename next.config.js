/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode — catches common bugs during development
  reactStrictMode: true,

  // Security headers applied to every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevents the browser from MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevents clickjacking attacks
          { key: "X-Frame-Options", value: "DENY" },
          // Forces HTTPS for 1 year, including subdomains
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Controls what data is sent in the Referer header
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Restricts browser features
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
