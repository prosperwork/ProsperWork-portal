import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";
import PortalRouteShell from "./_components/PortalRouteShell";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0a2e22",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://portal.prosperworkmusic.com"),
  title: {
    default: "ProsperWork Music Academy · Student & Staff Operations Portal",
    template: "%s · ProsperWork Academy",
  },
  description:
    "The official student, guardian, teacher, and operations portal for ProsperWork Music Concepts. Manage lessons, live virtual classrooms, practice boards, schedules, and academy workflows.",
  applicationName: "ProsperWork Music Academy Portal",
  authors: [{ name: "ProsperWork Music Concepts", url: "https://www.prosperworkmusic.com" }],
  generator: "Next.js",
  keywords: [
    "ProsperWork",
    "ProsperWork Music Academy",
    "Music Lessons Portal",
    "Online Music Learning",
    "Piano Lessons",
    "Saxophone Lessons",
    "Voice Lessons",
    "Music Student Portal",
    "Live Virtual Music Classroom",
  ],
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://portal.prosperworkmusic.com",
    siteName: "ProsperWork Music Academy Portal",
    title: "ProsperWork Music Academy · Student & Staff Operations Portal",
    description:
      "The official student, guardian, teacher, and operations portal for ProsperWork Music Concepts. Manage lessons, live virtual classrooms, practice boards, and curriculum.",
    images: [
      {
        url: "/favicon.png",
        width: 512,
        height: 512,
        alt: "ProsperWork Music Concepts Emblem",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "ProsperWork Music Academy Portal",
    description:
      "The official student, guardian, teacher, and operations portal for ProsperWork Music Concepts.",
    images: ["/favicon.png"],
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
  alternates: {
    canonical: "https://portal.prosperworkmusic.com",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${manrope.variable}`}>
      <body><PortalRouteShell>{children}</PortalRouteShell></body>
    </html>
  );
}
