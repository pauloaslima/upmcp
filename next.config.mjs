/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // conversor de fotos HEIC (iPhone): carregado do node_modules no servidor, sem empacotar
  serverExternalPackages: ["heic-convert", "heic-decode", "libheif-js"],
  // fontes usadas para desenhar as artes no servidor
  outputFileTracingIncludes: {
    "/api/design-agent": ["./lib/fonts/**"],
    "/api/mcp/**": ["./lib/fonts/**"]
  }
};

export default nextConfig;
