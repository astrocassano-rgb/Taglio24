import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "DogWash24",
  description: "La prima piattaforma ibrida per Self-Service e Toelettatura.",
  applicationName: "DogWash24",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DogWash24"
  },
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.className} min-h-dvh bg-slate-950 text-slate-50 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
