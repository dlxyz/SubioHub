﻿import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { defaultLocale } from "@/i18n/messages";
import { LocaleProvider } from "@/i18n/provider";
import { getMetadataBase } from "@/i18n/seo";
import { isAppLocale } from "@/store/locale";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "SubioHub - AI API Gateway",
  description: "统一的 AI 模型 API 分发管理系统。完美兼容 OpenAI 协议，支持多渠道负载均衡、额度管控与高可用分发。",
};

const themeInitScript = `
  (() => {
    try {
      const storedTheme = window.localStorage.getItem('theme');
      const theme =
        storedTheme === 'dark' || storedTheme === 'light'
          ? storedTheme
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.style.colorScheme = theme;
    } catch {}
  })();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const headerLocale = requestHeaders.get('x-subiohub-locale') || defaultLocale;
  const htmlLang = isAppLocale(headerLocale) ? headerLocale : defaultLocale;

  return (
    <html
      lang={htmlLang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <LocaleProvider key={defaultLocale} initialLocale={defaultLocale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}

