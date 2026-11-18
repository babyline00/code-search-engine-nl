import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Code Search Engine (NL) — search public repos in natural language",
  description:
    "Hybrid (BM25 + vector) code search across pre-indexed public GitHub repos. Ask in plain English, get ranked code snippets with file path, line range, an Open on GitHub link, and an AI 'Explain this snippet' button.",
  keywords: [
    "code search",
    "natural language search",
    "BM25",
    "vector search",
    "hybrid retrieval",
    "Next.js",
    "Prisma",
    "tree-sitter",
  ],
  authors: [{ name: "Code Search Engine (NL)" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
