/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    API_URL: process.env.API_URL || "http://localhost:3000/api/v1",
  },
};

module.exports = nextConfig;
