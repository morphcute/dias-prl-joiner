import type { Metadata } from "next";
import "./globals.css";
import { InactivityTracker } from "@/components/InactivityTracker";

export const metadata: Metadata = {
  title: "Dias & PRL Auto Joiner",
  description: "Consolidate Diamond Rewards Sheets and Pre-Registered Lists from multiple Community Handlers",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-[#F5EFEB] text-[#1C1917] selection:bg-[#C85A32]/20 selection:text-[#1C1917]">
        {children}
        <InactivityTracker />
      </body>
    </html>

  );
}
