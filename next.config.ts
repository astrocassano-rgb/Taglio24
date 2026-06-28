import withSerwistInit from "@serwist/next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Origini dev ammessi solo in locale — mai esposti in produzione
  ...(isDev ? { allowedDevOrigins: ["localhost", "100.108.195.2", "192.168.0.3"] } : {}),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Previene clickjacking — nessun embedding in iframe
          { key: "X-Frame-Options", value: "DENY" },
          // Previene MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Forza HTTPS per 1 anno con sotto-domini
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Limita informazioni referrer a cross-origin
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disabilita API browser non utilizzate
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          // CSP: permette inline per Tailwind/Framer Motion, blocca frame e object
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://vercel.live",
              "font-src 'self' https://fonts.gstatic.com https://vercel.live",
              "img-src 'self' data: blob: https://*.supabase.co https://vercel.com https://vercel.live",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://vercel.live wss://vercel.live",
              "frame-src https://checkout.stripe.com https://js.stripe.com https://vercel.live",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join("; ")
          }
        ]
      }
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" && process.env.NEXT_PWA !== "true",
});

export default withSerwist(nextConfig);
