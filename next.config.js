/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/api/:path*", // Apply to API routes
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Authorization, Content-Type, If-None-Match",
          },
        ],
      },
    ];
  },
  images: {
    domains: ['cryptologos.cc', 'assets.coingecko.com'], // if you ever add logos
  },
};

module.exports = nextConfig;
