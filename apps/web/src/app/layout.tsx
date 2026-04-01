import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Noto_Sans_Ethiopic } from "next/font/google";
import { AppProviders } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansEthiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic", "latin"],
  variable: "--font-ethiopic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PharmaHub",
  description: "Offline-friendly pharmacy management for Ethiopian pharmacies",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${notoSansEthiopic.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
