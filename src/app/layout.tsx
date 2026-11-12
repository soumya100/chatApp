import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Provider } from "@/common";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const baseUrl = process.env.NEXTAUTH_URL || "https://chatapp.com";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Chat+ | Real-Time Messaging & Voice Notes",
    template: "%s | Chat+",
  },
  description:
    "Fast, secure, real-time messaging with instant voice notes, video notes, group chats, and desktop notifications.",
  applicationName: "Chat+",
  authors: [{ name: "Chat+ Team" }],
  creator: "Chat+",
  publisher: "Chat+",
  keywords: [
    "chat",
    "messaging",
    "real-time chat",
    "voice notes",
    "video notes",
    "group chats",
    "secure communication",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "Chat+",
    title: "Chat+ | Real-Time Messaging & Voice Notes",
    description:
      "Connect seamlessly with friends and groups with instant voice messages, circular video notes, and real-time delivery.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chat+ | Real-Time Messaging",
    description:
      "Modern real-time communication platform featuring voice notes, group conversations, and instant notifications.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen antialiased bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100`}>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
