import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const editorial = Cormorant_Garamond({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "WedFlow",
  description: "Manajemen acara dan tamu pernikahan bersama WedFlow.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} ${editorial.variable} h-full antialiased`}
    >
      {/* Extensions may inject attributes on body before hydration. Keep suppression local. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <Toaster theme="light" richColors closeButton />
      </body>
    </html>
  );
}
