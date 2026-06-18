import withSerwistInit from "@serwist/next";

const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  allowedDevOrigins: ["localhost", "100.108.195.2"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }]
  }
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development" && process.env.NEXT_PWA !== "true",
});

export default withSerwist(nextConfig);
