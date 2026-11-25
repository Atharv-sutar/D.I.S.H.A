import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D.I.S.H.A. Fan Guide & Wayfinding",
  description:
    "Smart stadium navigation: least-crowded gates, fastest concessions, accessible routes, and live advisories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
