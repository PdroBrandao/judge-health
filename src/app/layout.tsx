import type { Metadata } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/AppNav";
import { HistoricalNoticeController } from "@/components/HistoricalNoticeController";
import { activeWorkspace } from "@/data/experiment-store";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Judge Health",
  description:
    "Continuous validation of model-based evaluators — AACI Framework",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const archived = activeWorkspace().mode === "archived";
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppNav />
        <div className="flex-1">
          <HistoricalNoticeController enabled={archived}>
            {children}
          </HistoricalNoticeController>
        </div>
      </body>
    </html>
  );
}
