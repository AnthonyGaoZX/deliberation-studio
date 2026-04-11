import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "思辨剧场 | Deliberation Studio",
  description:
    "A beginner-friendly multi-AI discussion app for comparing viewpoints, exploring trade-offs, and reaching clearer decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
