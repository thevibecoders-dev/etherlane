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
  const imageUrl = new URL("/og-signal-oracle.png", `${protocol}://${host}`).toString();

  return {
    title: "Etherlane — The Signal Oracle",
    description:
      "Hold the living Internet in your hand. Tune public signals into resonance, light and space with zero retention.",
    openGraph: {
      title: "Etherlane — The Signal Oracle",
      description: "A tactile, zero-retention instrument for the public Internet.",
      type: "website",
      locale: "en_US",
      images: [
        {
          url: imageUrl,
          width: 1680,
          height: 945,
          alt: "Etherlane — The Signal Oracle, a luminous digital resonator receiving public Internet signals",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Etherlane — The Signal Oracle",
      description: "A tactile, zero-retention instrument for the public Internet.",
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
