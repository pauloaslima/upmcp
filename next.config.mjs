/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // fontes usadas para desenhar as artes no servidor
  outputFileTracingIncludes: {
    "/api/design-agent": ["./lib/fonts/**"]
  }
};

export default nextConfig;
