import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Morrow",
  description: "Browsers that remember.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="morrow" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-base-100 text-base-content font-sans antialiased">{children}</body>
    </html>
  );
}
