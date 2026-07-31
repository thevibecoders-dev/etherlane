import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06060a",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = new URL("/og.png", `${protocol}://${host}`).toString();

  return {
    title: "Etherlane — Stand inside the internet",
    description:
      "An internet weather observatory translating public routing, latency, traffic and infrastructure signals into packet architecture, light and generative sound.",
    openGraph: {
      title: "Etherlane — Stand inside the internet",
      description: "Public internet signals become packet traffic, route architecture and weather.",
      type: "website",
      locale: "en_US",
      images: [
        {
          url: imageUrl,
          width: 1672,
          height: 941,
          alt: "Etherlane — an infinite highway of luminous public internet packets",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Etherlane — Stand inside the internet",
      description: "Public internet signals become packet traffic, route architecture and weather.",
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
