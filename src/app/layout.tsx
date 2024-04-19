import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Provider } from "@/common";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chat +",
  description: "Chat with anyone endlessly",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Provider>
          {children}
          </Provider>
          </body>
    </html>
  );
}
