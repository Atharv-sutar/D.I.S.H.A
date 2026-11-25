import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D.I.S.H.A. • Simulator Studio (Demo Control)",
  description:
    "Behind-the-scenes congestion and incident simulator for M. Chinnaswamy Stadium.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
