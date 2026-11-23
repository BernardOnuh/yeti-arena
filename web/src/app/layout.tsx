import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Yeti Arena",
  description: "60-second skill games where every high score is verified by replay, with seasons and achievement badges on Sui.",
};
export const viewport: Viewport = { themeColor: "#0b1033", width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="sky-bg min-h-screen">
        <Providers>
        <Nav />
        <main>{children}</main>
        <footer className="mt-16 border-t border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-8 text-[13px] text-sky-100/50 sm:px-6">
            Free to play. No wagers, no paid entry, no tokens: badges are cosmetic achievements. Built for CLAY Hackathon III.
          </div>
        </footer>
        </Providers>
      </body>
    </html>
  );
}
