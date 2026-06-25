import type { NextConfig } from "next";

// Conservative, app-wide security headers. Note: X-Frame-Options / CSP
// frame-ancestors are intentionally NOT set globally because this app embeds
// itself in iframes (board-watch on the district site, signage screens). Add a
// scoped frame policy per-route if that ever changes.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    // camera=(self): the equipment tag scanner (/dashboard/equipment/scan) uses
    // getUserMedia, so same-origin camera access must stay allowed. Mic and
    // geolocation are unused and stay disabled.
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
