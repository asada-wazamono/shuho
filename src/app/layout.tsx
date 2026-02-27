import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "週報・案件管理システム",
  description: "全体マネジメントの簡易化・視覚化",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
