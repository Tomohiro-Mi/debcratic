import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: {
    default: "でぶねこによる民主主義",
    template: "%s | でぶねこによる民主主義",
  },
  description:
    "ユーザーの議論を入力として、でぶねこ社会の世論・権力・派閥・思想が継続的に変化していく政治社会シミュレーション。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-[#fbf6ec] font-sans text-stone-800 antialiased">
        <NavBar />
        <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">{children}</main>
        <footer className="border-t border-orange-100 bg-white/60 py-6 text-center text-xs text-stone-400">
          🐾 でぶねこによる民主主義 — 猫は傷ついていません。これはシミュレーションです。
        </footer>
      </body>
    </html>
  );
}
