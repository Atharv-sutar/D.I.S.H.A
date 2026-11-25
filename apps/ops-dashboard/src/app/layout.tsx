import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D.I.S.H.A. Ops Command Center",
  description:
    "Real-time stadium congestion heatmap, queue telemetry, and incident triage dashboard.",
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
