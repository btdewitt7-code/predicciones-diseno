import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // Permite abrir la app desde el celular (wifi local y red Tailscale)
  // sin que Next bloquee los recursos de desarrollo.
  allowedDevOrigins: ["192.168.18.7", "100.83.32.83", "dogebets.win"],
  // En desarrollo no cachear los assets: Cloudflare los guardaba 4 h y los
  // cambios de CSS no se veían hasta que expiraba la caché.
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
