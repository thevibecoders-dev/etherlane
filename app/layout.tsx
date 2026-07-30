import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = new URL("/og-etherlane.png", `${protocol}://${host}`).toString();

  return {
    title: "Etherlane — Stand inside the flow",
    description:
      "A live audiovisual observatory translating public routing, network measurements and global knowledge signals into light, motion, generative music and a changing data voice.",
    openGraph: {
      title: "Etherlane — Stand inside the flow",
      description: "The public internet, translated into light, motion and generative music.",
      type: "website",
      locale: "en_US",
      images: [
        {
          url: imageUrl,
          width: 1680,
          height: 945,
          alt: "Etherlane — a luminous highway of public internet signals",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Etherlane — Stand inside the flow",
      description: "The public internet, translated into light, motion and generative music.",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
