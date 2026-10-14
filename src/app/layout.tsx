import type { Metadata } from "next";
import "./globals.css";
import PortalRouteShell from "./_components/PortalRouteShell";

export const metadata: Metadata = {
  title: "ProsperWork · Academy Operations",
  description: "The connected operations and learning workspace for ProsperWork Music Concepts.",
  icons: { icon: "/favicon-96x96.png", apple: "/apple-touch-icon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><PortalRouteShell>{children}</PortalRouteShell></body>
    </html>
  );
}
